'use strict';

/**
 * ============================================================================
 * SpendingIntelligenceEngine
 * ============================================================================
 *
 * Every financial calculation and pattern-detection rule in SpendGuard lives
 * here, as pure functions over plain data (arrays of transaction POJOs, budget
 * POJOs, a profile object). The engine never touches the database and never
 * reads process.env — callers supply data and configuration. This makes the
 * engine independently unit-testable and keeps controllers/services thin.
 *
 * DESIGN PRINCIPLES (the "trust contract"):
 *  1. Deterministic — the same inputs always produce the same insight.
 *  2. Explainable — every result carries the data used, the formula, the
 *     calculation and the interpretation.
 *  3. Honest about insufficient data — functions return `available: false`
 *     with a reason instead of inventing a pattern.
 *  4. Decision-support, not advice — recommendations are neutral observations.
 *
 * Money convention: amounts are Numbers rounded to 2 decimals; dates are UTC
 * midnights (see utils/dateUtils).
 */

const {
  parseDay,
  toDayString,
  monthRange,
  previousMonthRange,
  daysBetween,
  elapsedDaysInMonth,
  daysInMonth,
  daysRemainingInMonth,
  monthKey,
} = require('../utils/dateUtils');
const { round2, percent, clamp, sum, stdDev } = require('../utils/money');
const { FREQUENCY_MONTHS } = require('../config/constants');

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'AED ' };

const fmt = (value, currency = 'INR') => {
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${symbol}${round2(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

// ---------------------------------------------------------------------------
// 1. Period summary
// ---------------------------------------------------------------------------

/**
 * Aggregates raw transactions for an inclusive-exclusive [start, end) window.
 * Returns totals, per-category breakdown and a per-day series used by charts
 * and volatility calculations.
 */
function computePeriodSummary(transactions, { start, end } = {}) {
  const inRange = transactions.filter((t) => {
    const d = parseDay(t.date);
    if (!d) return false;
    if (start && d < start) return false;
    if (end && d >= end) return false;
    return true;
  });

  const income = sum(inRange.filter((t) => t.type === 'income').map((t) => t.amount));
  const expenses = sum(inRange.filter((t) => t.type === 'expense').map((t) => t.amount));

  const byCategory = {};
  const daily = {};
  for (const t of inRange) {
    const day = toDayString(parseDay(t.date));
    if (!daily[day]) daily[day] = { date: day, income: 0, expenses: 0, count: 0 };
    daily[day][t.type === 'income' ? 'income' : 'expenses'] += t.amount;
    daily[day].count += 1;

    const cat = t.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = { category: cat, income: 0, expenses: 0, count: 0 };
    byCategory[cat][t.type === 'income' ? 'income' : 'expenses'] += t.amount;
    byCategory[cat].count += 1;
  }

  const categories = Object.values(byCategory)
    .map((c) => ({ ...c, income: round2(c.income), expenses: round2(c.expenses) }))
    .sort((a, b) => b.expenses - a.expenses);

  const dailySeries = Object.values(daily)
    .map((d) => ({ ...d, income: round2(d.income), expenses: round2(d.expenses) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const savings = round2(income - expenses);
  const savingsRate = income > 0 ? percent(savings, income) : null; // null = incomputable, never faked

  return {
    transactionCount: inRange.length,
    income: round2(income),
    expenses: round2(expenses),
    savings,
    savingsRate,
    categories,
    dailySeries,
  };
}

// ---------------------------------------------------------------------------
// 2. Budget projection & status
// ---------------------------------------------------------------------------

/** Explicit, documented status thresholds (no arbitrary "feels about right"). */
const BUDGET_THRESHOLDS = {
  yellowUtilizationPct: 80, // spent ≥ 80% of budget → YELLOW
  yellowProjectedPct: 90, // projected spend ≥ 90% of budget → YELLOW
};

/**
 * Projects month-end spending for one budget and assigns a status.
 *
 * Formula (two-part, because a naive linear projection over-extrapolates
 * fixed costs that land early in the month — rent on the 2nd would otherwise
 * be multiplied across the whole month):
 *
 *   fixedCommitment   = known recurring monthly cost in this category
 *   fixedAlreadyPaid  = min(spent, fixedCommitment)
 *   variableSpent     = max(spent − fixedAlreadyPaid, 0)
 *   projected = (variableSpent / daysElapsed) × daysInMonth + fixedCommitment
 *
 * Fixed commitments are counted at their known monthly cost; only genuinely
 * variable spending is extrapolated. Callers that do not pass recurring data
 * (recurringMonthlyForCategory = 0) get the plain linear projection.
 *
 * Status:  RED    spent > budget, OR projected > budget
 *          YELLOW utilization ≥ 80% OR projected ≥ 90% of budget
 *          GREEN  otherwise
 */
function computeBudgetStatus({ budget, spent, now = new Date(), recurringMonthlyForCategory = 0 }) {
  const elapsed = elapsedDaysInMonth(now);
  const total = daysInMonth(now);
  const remainingDays = daysRemainingInMonth(now);
  const safeElapsed = elapsed > 0 ? elapsed : 1;

  const spentValue = round2(spent || 0);
  const budgetAmount = round2(budget.amount);
  const remaining = round2(budgetAmount - spentValue);
  const utilizationPct = budgetAmount > 0 ? percent(spentValue, budgetAmount) : null;

  const fixedCommitment = round2(recurringMonthlyForCategory || 0);
  const fixedAlreadyPaid = round2(Math.min(spentValue, fixedCommitment));
  const variableSpent = round2(Math.max(spentValue - fixedAlreadyPaid, 0));

  let variableProjection = 0;
  let projected = 0;
  if (elapsed > 0) {
    variableProjection = round2((variableSpent / safeElapsed) * total);
    projected = round2(variableProjection + fixedCommitment);
  }
  const projectedOverrun = round2(Math.max(projected - budgetAmount, 0));

  let status;
  let statusReason;
  if (spentValue > budgetAmount) {
    status = 'RED';
    statusReason = `Budget already exceeded by ${fmt(spentValue - budgetAmount, budget.currency)}`;
  } else if (projected > budgetAmount && spentValue > 0) {
    status = 'RED';
    statusReason = `At the current pace you are projected to exceed this budget by ${fmt(projectedOverrun, budget.currency)}`;
  } else if (
    (utilizationPct !== null && utilizationPct >= BUDGET_THRESHOLDS.yellowUtilizationPct) ||
    (budgetAmount > 0 && projected >= (BUDGET_THRESHOLDS.yellowProjectedPct / 100) * budgetAmount && spentValue > 0)
  ) {
    status = 'YELLOW';
    statusReason = 'Spending is approaching the budget limit';
  } else {
    status = 'GREEN';
    statusReason = 'Spending is comfortably within budget';
  }

  return {
    budgetId: budget.id || (budget._id ? budget._id.toString() : null),
    category: budget.category,
    month: budget.month,
    budgetAmount,
    spent: spentValue,
    remaining,
    utilizationPct,
    daysElapsed: elapsed,
    daysRemaining: remainingDays,
    daysInMonth: total,
    projected,
    projectedOverrun,
    // projection transparency — the UI/insight layer shows this breakdown
    fixedMonthlyCommitment: fixedCommitment,
    fixedAlreadyPaid,
    variableSpent,
    variableProjection,
    projectionMethod:
      fixedCommitment > 0
        ? 'projected = (variableSpent / daysElapsed) × daysInMonth + fixedMonthlyCommitment'
        : 'projected = (spent / daysElapsed) × daysInMonth',
    status,
    statusReason,
  };
}

// ---------------------------------------------------------------------------
// 3. Spending velocity
// ---------------------------------------------------------------------------

/**
 * Spending velocity = how fast money is leaving right now, and what that
 * implies if the pace continues.
 *
 * dailyRate        = expenses / daysElapsed
 * projectedTotal   = expenses + dailyRate × daysRemaining
 * potentialOverrun = max(projectedTotal − budget, 0)
 */
function computeSpendingVelocity({ expenses, budget, now = new Date() }) {
  const elapsed = elapsedDaysInMonth(now);
  const remainingDays = daysRemainingInMonth(now);
  const safeElapsed = elapsed > 0 ? elapsed : 1;

  const expensesValue = round2(expenses || 0);
  const dailyRate = elapsed > 0 ? round2(expensesValue / safeElapsed) : 0;
  const projectedAdditional = round2(dailyRate * remainingDays);
  const projectedTotal = round2(expensesValue + projectedAdditional);
  const budgetValue = budget !== undefined && budget !== null ? round2(budget) : null;

  const potentialOverrun = budgetValue !== null ? round2(Math.max(projectedTotal - budgetValue, 0)) : null;
  const onPaceForOverrun = budgetValue !== null && projectedTotal > budgetValue && expensesValue > 0;

  return {
    expenses: expensesValue,
    daysElapsed: elapsed,
    daysRemaining: remainingDays,
    dailyRate,
    projectedAdditional,
    projectedTotal,
    budget: budgetValue,
    potentialOverrun,
    onPaceForOverrun,
    formula:
      'dailyRate = expenses / daysElapsed; projectedTotal = expenses + dailyRate × daysRemaining; potentialOverrun = max(projectedTotal − budget, 0)',
  };
}

// ---------------------------------------------------------------------------
// 4. Safe-to-spend estimate
// ---------------------------------------------------------------------------

/**
 * Safe-to-spend per day for the rest of the month.
 *
 * Preferred basis: remaining category budgets for this month.
 *   available = Σ(budget amounts) − Σ(spent in budgeted categories)
 * Fallback (no budgets defined): income − expenses so far − remaining
 * recurring commitments for the month.
 *
 * This is explicitly an ESTIMATE — it cannot see unplanned future expenses.
 * The limitation note travels with the result so the UI can show it.
 */
function computeSafeToSpend({ transactions, budgets, recurringMonthlyCost, profile, now = new Date() }) {
  const remainingDays = daysRemainingInMonth(now);
  const { start, end } = monthRange(now);
  const summary = computePeriodSummary(transactions, { start, end });

  let basis;
  let available;

  const monthKeyNow = monthKey(now);
  const monthBudgets = (budgets || []).filter((b) => (b.month || monthKeyNow) === monthKeyNow);

  if (monthBudgets.length > 0) {
    const budgetedCategories = new Set(monthBudgets.map((b) => b.category));
    const spentInBudgeted = sum(
      summary.categories.filter((c) => budgetedCategories.has(c.category)).map((c) => c.expenses)
    );
    const totalBudgeted = sum(monthBudgets.map((b) => b.amount));
    available = round2(totalBudgeted - spentInBudgeted);
    basis = 'remaining category budgets';
  } else {
    const income = profile && Number(profile.monthlyIncome) > 0 ? Number(profile.monthlyIncome) : summary.income;
    const recurring = round2(recurringMonthlyCost || 0);
    available = round2(income - summary.expenses - recurring);
    basis = 'income − expenses so far − recurring commitments';
  }

  const perDay = remainingDays > 0 ? round2(available / remainingDays) : null;

  return {
    available,
    remainingDays,
    perDay,
    basis,
    isEstimate: true,
    limitation:
      'Calculated from your current available budget and remaining days. It does not account for unexpected future expenses.',
    formula:
      monthBudgets.length > 0
        ? 'available = Σ(budgets) − Σ(spent in budgeted categories); perDay = available / daysRemaining'
        : 'available = income − expenses so far − recurring commitments; perDay = available / daysRemaining',
  };
}

// ---------------------------------------------------------------------------
// 5. Micro-spending leakage detection
// ---------------------------------------------------------------------------

/**
 * Micro-spending = individual transactions below a configurable threshold
 * that feel insignificant one at a time but add up collectively.
 *
 * Returns count, total, share of monthly expenses, the dominant category and
 * a per-category breakdown. The engine deliberately does NOT label this
 * behaviour "bad" — it presents the numbers and lets the user judge.
 */
function detectMicroSpending({ transactions, threshold = 200, totalExpenses, now = new Date() }) {
  const { start, end } = monthRange(now);
  const monthExpenses = transactions.filter((t) => {
    const d = parseDay(t.date);
    return t.type === 'expense' && d >= start && d < end;
  });

  const small = monthExpenses.filter((t) => t.amount < threshold);
  const total = sum(small.map((t) => t.amount));
  const shareOfExpenses = totalExpenses > 0 ? percent(total, totalExpenses) : null;

  const byCategory = {};
  for (const t of small) {
    const cat = t.category || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + t.amount;
  }
  const breakdown = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount: round2(amount), share: total > 0 ? percent(amount, total) : null }))
    .sort((a, b) => b.amount - a.amount);

  const dominant = breakdown[0] || null;

  return {
    available: monthExpenses.length > 0,
    threshold,
    count: small.length,
    total: round2(total),
    shareOfExpenses,
    averageValue: small.length > 0 ? round2(total / small.length) : null,
    dominantCategory: dominant ? { category: dominant.category, share: dominant.share } : null,
    breakdown,
    monthExpenseCount: monthExpenses.length,
  };
}

// ---------------------------------------------------------------------------
// 6. Category trend analysis (current month vs previous month)
// ---------------------------------------------------------------------------

/**
 * Percentage change per category: ((current − previous) / previous) × 100.
 *
 * Callers should pass a LIKE-FOR-LIKE previous window: comparing the current
 * partial month against the previous FULL month systematically shows fake
 * "−80%" declines. `comparisonLabel` documents which windows were used.
 *
 * Zero-previous is a guarded case: pct is null and the category is listed
 * under `newThisMonth` instead of producing a fabricated percentage.
 */
function computeCategoryTrends(currentSummary, previousSummary, { comparisonLabel = 'current month vs previous month' } = {}) {
  if (!previousSummary || previousSummary.expenses === 0) {
    return {
      available: false,
      reason:
        'Comparison unavailable. Add more historical transactions to compare spending trends.',
      categories: [],
      comparisonLabel,
    };
  }

  const prevMap = new Map(previousSummary.categories.map((c) => [c.category, c.expenses]));
  const currMap = new Map(currentSummary.categories.map((c) => [c.category, c.expenses]));
  const allCategories = new Set([...prevMap.keys(), ...currMap.keys()]);

  const categories = [];
  for (const category of allCategories) {
    const current = currMap.get(category) || 0;
    const previous = prevMap.get(category) || 0;
    const change = round2(current - previous);
    const pct = previous > 0 ? percent(change, previous) : null; // null → no fake division by zero
    categories.push({
      category,
      current: round2(current),
      previous: round2(previous),
      change,
      changePct: pct,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      isNew: previous === 0 && current > 0,
    });
  }

  categories.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return {
    available: true,
    previousWindowExpenses: previousSummary.expenses,
    currentWindowExpenses: currentSummary.expenses,
    comparisonLabel,
    categories,
    formula: 'changePct = ((current − previous) / previous) × 100',
  };
}

// ---------------------------------------------------------------------------
// 7. Recurring expense detection
// ---------------------------------------------------------------------------

/** Collapse merchant noise: lowercase, strip common payment suffixes. */
function normalizeMerchant(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(autopay|auto pay|payment|subscription|recharge|monthly|bill)\b/g, '')
    .trim();
}

/**
 * Detects recurring expenses from transaction history.
 *
 * Algorithm (deliberately transparent, no ML):
 *  1. Group expense transactions by normalized merchant (merchant is required
 *     for auto-detection — the user-friendly name can differ).
 *  2. Within each group, cluster by amount within a ±10% tolerance.
 *  3. Sort by date, compute the gaps between consecutive occurrences and
 *     take the median gap.
 *  4. Classify cadence: 25–35 days → monthly, 5–9 → weekly, 85–100 →
 *     quarterly, 350–380 → yearly. Gaps must be consistent (each gap within
 *     ±5 days of the median) so one-off purchases never qualify.
 *  5. Confidence: 3+ consistent occurrences with at least 60 days of history
 *     → 'high'; 3+ occurrences → 'medium'; 2 occurrences → 'low' (reported
 *     as a possible pattern only, never counted as a commitment).
 */
const CADENCE_RULES = [
  { frequency: 'weekly', minGap: 5, maxGap: 9 },
  { frequency: 'monthly', minGap: 25, maxGap: 35 },
  { frequency: 'quarterly', minGap: 85, maxGap: 100 },
  { frequency: 'yearly', minGap: 350, maxGap: 380 },
];

function detectRecurringExpenses({ transactions, minDaysForRecurring = 60, now = new Date() }) {
  const expenses = transactions
    .filter((t) => t.type === 'expense' && t.merchant)
    .map((t) => ({ ...t, date: parseDay(t.date), merchantNorm: normalizeMerchant(t.merchant) }))
    .filter((t) => t.date && t.merchantNorm)
    .sort((a, b) => a.date - b.date);

  // Overall history span gates confidence: an account opened last week cannot
  // honestly support "this happens every month".
  const dataSpanDays = expenses.length > 1 ? daysBetween(expenses[0].date, expenses[expenses.length - 1].date) : 0;

  const groups = new Map();
  for (const t of expenses) {
    const key = `${t.merchantNorm}|${Math.round(t.amount / Math.max(t.amount * 0.1, 0.01))}`; // amount bucket ≈ ±10%
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const candidates = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;

    const gaps = [];
    for (let i = 1; i < group.length; i += 1) {
      gaps.push(daysBetween(group[i - 1].date, group[i].date));
    }
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
    const cadence = CADENCE_RULES.find(
      (r) => medianGap >= r.minGap && medianGap <= r.maxGap
    );
    if (!cadence) continue;

    const consistent = gaps.every((g) => Math.abs(g - medianGap) <= 5);
    if (!consistent) continue;

    const amounts = group.map((t) => t.amount);
    const avgAmount = round2(sum(amounts) / amounts.length);
    const last = group[group.length - 1];
    const first = group[0];
    const spanDays = daysBetween(first.date, last.date);

    let confidence = 'low';
    if (group.length >= 3 && spanDays >= minDaysForRecurring) confidence = 'high';
    else if (group.length >= 3) confidence = 'medium';

    const monthsPerCycle = FREQUENCY_MONTHS[cadence.frequency];
    const monthlyCost = round2(avgAmount / monthsPerCycle);

    candidates.push({
      name: last.merchant,
      merchant: last.merchant,
      category: last.category || 'Subscriptions',
      paymentMethod: last.paymentMethod || 'Other',
      frequency: cadence.frequency,
      amount: avgAmount,
      monthlyCost,
      annualCost: round2(monthlyCost * 12),
      occurrenceCount: group.length,
      firstDate: toDayString(first.date),
      lastDate: toDayString(last.date),
      nextExpectedDate: toDayString(new Date(last.date.getTime() + medianGap * 86_400_000)),
      confidence,
      transactionIds: group.map((t) => (t.id || t._id ? String(t.id || t._id) : null)).filter(Boolean),
      medianGapDays: medianGap,
    });
  }

  candidates.sort((a, b) => b.monthlyCost - a.monthlyCost);

  const committed = candidates.filter((c) => c.confidence === 'high' || c.confidence === 'medium');
  const monthlyRecurringCost = round2(sum(committed.map((c) => c.monthlyCost)));

  return {
    available: candidates.length > 0,
    dataSpanDays,
    hasSufficientHistory: dataSpanDays >= minDaysForRecurring,
    insufficientHistoryMessage:
      'Not enough transaction history yet to confirm recurring patterns reliably. Keep logging transactions and SpendGuard will surface them here.',
    candidates,
    committed,
    monthlyRecurringCost,
    annualRecurringCost: round2(monthlyRecurringCost * 12),
  };
}

// ---------------------------------------------------------------------------
// 8. Spending pattern analysis (behavioural patterns with data guards)
// ---------------------------------------------------------------------------

/**
 * Behavioural patterns over the user's whole history. Each sub-analysis
 * independently reports `available: false` with a reason when the underlying
 * data is too thin — SpendGuard never claims a pattern it cannot support.
 *
 * Minimums (configurable via env):
 *  - history span ≥ minDays days AND ≥ 8 expense transactions for any pattern
 *  - weekday/weekend additionally needs ≥ 2 expense days of each kind
 */
const MIN_EXPENSE_TX_FOR_PATTERNS = 8;

function analyzeSpendingPatterns({ transactions, minDays = 14, now = new Date() }) {
  const parsed = transactions
    .map((t) => ({ ...t, date: parseDay(t.date) }))
    .filter((t) => t.date)
    .sort((a, b) => a.date - b.date);

  const expenseTx = parsed.filter((t) => t.type === 'expense');
  const spanDays = parsed.length > 0 ? Math.max(daysBetween(parsed[0].date, parsed[parsed.length - 1].date) + 1, 1) : 0;
  const insufficient = {
    available: false,
    historySpanDays: spanDays,
    expenseCount: expenseTx.length,
    reason: `Not enough historical data to identify reliable spending patterns yet (${expenseTx.length} expenses over ${spanDays} days). Keep logging transactions.`,
  };

  if (spanDays < minDays || expenseTx.length < MIN_EXPENSE_TX_FOR_PATTERNS) {
    return { ...insufficient, weekendVsWeekday: null, dayOfWeek: null, monthPhase: null, concentration: null, frequency: null, topDays: null };
  }

  const today = parseDay(toDayString(now));
  // Cap the analysis window at 180 days so very old history cannot drown out
  // current behaviour.
  const windowStart = new Date(today.getTime() - 179 * 86_400_000);
  const window = expenseTx.filter((t) => t.date >= windowStart);

  // --- weekday vs weekend (per-day averages over days present in the window)
  const daysPresent = new Set(window.map((t) => toDayString(t.date)));
  const weekendSpend = { total: 0, days: 0 };
  const weekdaySpend = { total: 0, days: 0 };
  for (const day of daysPresent) {
    const d = parseDay(day);
    const dow = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const dayTotal = sum(window.filter((t) => toDayString(t.date) === day).map((t) => t.amount));
    if (dow === 0 || dow === 6) {
      weekendSpend.total += dayTotal;
      weekendSpend.days += 1;
    } else {
      weekdaySpend.total += dayTotal;
      weekdaySpend.days += 1;
    }
  }
  const weekendAvg = weekendSpend.days > 0 ? weekendSpend.total / weekendSpend.days : null;
  const weekdayAvg = weekdaySpend.days > 0 ? weekdaySpend.total / weekdaySpend.days : null;
  const weekendVsWeekday =
    weekendAvg !== null && weekdayAvg !== null && weekdaySpend.days >= 2 && weekendSpend.days >= 2 && weekdayAvg > 0
      ? {
          available: true,
          weekendAvg: round2(weekendAvg),
          weekdayAvg: round2(weekdayAvg),
          weekendDays: weekendSpend.days,
          weekdayDays: weekdaySpend.days,
          differencePct: percent(weekendAvg - weekdayAvg, weekdayAvg),
          formula: 'differencePct = ((weekendAvgDaily − weekdayAvgDaily) / weekdayAvgDaily) × 100',
        }
      : {
          available: false,
          reason: 'Not enough historical data to identify a reliable weekday/weekend pattern yet.',
        };

  // --- day-of-week profile
  const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dowTotals = Array.from({ length: 7 }, () => ({ total: 0, days: 0 }));
  for (const day of daysPresent) {
    const d = parseDay(day);
    const dayTotal = sum(window.filter((t) => toDayString(t.date) === day).map((t) => t.amount));
    dowTotals[d.getUTCDay()].total += dayTotal;
    dowTotals[d.getUTCDay()].days += 1;
  }
  const dayOfWeek = dowTotals
    .map((x, i) => ({ day: dowNames[i], avgDaily: x.days > 0 ? round2(x.total / x.days) : 0, daysObserved: x.days }))
    .filter((x) => x.daysObserved > 0)
    .sort((a, b) => b.avgDaily - a.avgDaily);

  // --- month phase: first 10 days vs last 10 days average daily spend
  const phase = { first: { total: 0, days: 0 }, last: { total: 0, days: 0 } };
  for (const day of daysPresent) {
    const d = parseDay(day);
    const dayTotal = sum(window.filter((t) => toDayString(t.date) === day).map((t) => t.amount));
    const dim = daysInMonth(d);
    if (d.getUTCDate() <= 10) {
      phase.first.total += dayTotal;
      phase.first.days += 1;
    } else if (d.getUTCDate() > dim - 10) {
      phase.last.total += dayTotal;
      phase.last.days += 1;
    }
  }
  const firstAvg = phase.first.days > 0 ? phase.first.total / phase.first.days : null;
  const lastAvg = phase.last.days > 0 ? phase.last.total / phase.last.days : null;
  const monthPhase =
    firstAvg !== null && lastAvg !== null && firstAvg > 0
      ? {
          available: true,
          startOfMonthAvg: round2(firstAvg),
          endOfMonthAvg: round2(lastAvg),
          differencePct: percent(lastAvg - firstAvg, firstAvg),
        }
      : { available: false, reason: 'Not enough month coverage to compare start-of-month vs end-of-month behaviour yet.' };

  // --- concentration: how much of spending sits in the top categories/days
  const totalWindowSpend = sum(window.map((t) => t.amount));
  const byCategory = {};
  for (const t of window) {
    const cat = t.category || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + t.amount;
  }
  const categoryShares = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount: round2(amount), share: percent(amount, totalWindowSpend) }))
    .sort((a, b) => b.amount - a.amount);

  const byDay = {};
  for (const t of window) {
    const day = toDayString(t.date);
    byDay[day] = (byDay[day] || 0) + t.amount;
  }
  const topDays = Object.entries(byDay)
    .map(([date, amount]) => ({ date, amount: round2(amount), share: percent(amount, totalWindowSpend) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const concentration = {
    topCategory: categoryShares[0] || null,
    topThreeShare: percent(sum(categoryShares.slice(0, 3).map((c) => c.amount)), totalWindowSpend),
    topDay: topDays[0] || null,
  };

  const frequency = {
    avgTransactionsPerDay: round2(window.length / daysPresent.size),
    distinctDays: daysPresent.size,
    expenseCount: window.length,
  };

  // --- volatility: coefficient of variation of daily spend (with zero-spend days included)
  const allDays = [];
  for (const day of daysPresent) allDays.push(sum(window.filter((t) => toDayString(t.date) === day).map((t) => t.amount)));
  const meanDaily = allDays.length > 0 ? sum(allDays) / allDays.length : 0;
  const cv = meanDaily > 0 ? stdDev(allDays) / meanDaily : null;
  const volatility = cv !== null ? { coefficientOfVariation: Math.round(cv * 100) / 100, meanDailySpend: round2(meanDaily) } : null;

  return {
    available: true,
    historySpanDays: spanDays,
    expenseCount: expenseTx.length,
    weekendVsWeekday,
    dayOfWeek,
    monthPhase,
    concentration,
    frequency,
    volatility,
    topDays,
  };
}

// ---------------------------------------------------------------------------
// 9. Financial Health Indicator (0–100, fully explainable)
// ---------------------------------------------------------------------------

/**
 * SpendGuard Financial Health Indicator — NOT a professional assessment.
 *
 * Base weights (documented in the README):
 *   budget adherence          25 pts
 *   savings rate              25 pts
 *   projected budget stability 20 pts
 *   recurring expense burden   15 pts
 *   spending consistency       15 pts
 *
 * Components that cannot be computed (e.g. no budgets, zero income) are
 * EXCLUDED and their weight is redistributed proportionally across the
 * remaining components. The response reports every component's earned points
 * and the formula behind it, so the dashboard can show WHY the score is what
 * it is. A score without applicable components is returned as null.
 */
const HEALTH_COMPONENTS = {
  budgetAdherence: { weight: 25, label: 'Budget adherence' },
  savingsRate: { weight: 25, label: 'Savings rate' },
  budgetStability: { weight: 20, label: 'Projected budget stability' },
  recurringBurden: { weight: 15, label: 'Recurring expense burden' },
  consistency: { weight: 15, label: 'Spending consistency' },
};

function computeFinancialHealth({ currentSummary, budgetsStatuses, recurringMonthlyCost, patterns, profile, trends }) {
  const currency = profile?.currency || 'INR';
  const raw = [];
  const positives = [];
  const attention = [];
  const notes = [];

  // --- 1. Budget adherence (how well budgets are being respected right now)
  const statuses = (budgetsStatuses || []).filter((b) => b.utilizationPct !== null);
  if (statuses.length > 0) {
    // adherence per budget: 1.0 up to 90% utilization, falls to 0.5 at 100%,
    // then declines linearly to 0 at 200% utilization.
    const per = statuses.map((b) => {
      const u = b.utilizationPct / 100;
      const adherence = u <= 0.9 ? 1 : u <= 1 ? 1 - ((u - 0.9) / 0.1) * 0.5 : Math.max(0.5 - (u - 1) * 0.5, 0);
      return { category: b.category, utilizationPct: b.utilizationPct, adherence: Math.round(adherence * 100) / 100 };
    });
    const avgAdherence = sum(per.map((p) => p.adherence)) / per.length;
    raw.push({
      key: 'budgetAdherence',
      max: HEALTH_COMPONENTS.budgetAdherence.weight,
      earned: Math.round(avgAdherence * HEALTH_COMPONENTS.budgetAdherence.weight * 10) / 10,
      formula: 'adherence per budget = 1 if util ≤ 90%, else declines to 0 at 200% utilization; score = 25 × mean(adherence)',
      detail: `${statuses.filter((b) => b.status === 'GREEN').length}/${statuses.length} budgets on track`,
      perBudget: per,
    });
    const worst = [...statuses].sort((a, b) => b.utilizationPct - a.utilizationPct)[0];
    if (avgAdherence >= 0.9) positives.push(`${worst ? `${statuses.length} budgets` : 'Budgets'} well respected (${Math.round(avgAdherence * 100)}% adherence)`);
    if (worst && worst.utilizationPct >= 90) attention.push(`${worst.category} budget is ${worst.utilizationPct}% used`);
  } else {
    notes.push('Budget adherence excluded — no budgets defined for this month.');
  }

  // --- 2. Savings rate vs target
  const income = currentSummary.income;
  const savingsRate = currentSummary.savingsRate; // null when income is 0
  if (income > 0 && savingsRate !== null) {
    const target = Number(profile?.targetSavingsRate);
    const targetRate = Number.isFinite(target) && target > 0 ? target : 20;
    const ratio = savingsRate / targetRate;
    const earned = Math.round(clamp(ratio, 0, 1) * HEALTH_COMPONENTS.savingsRate.weight * 10) / 10;
    raw.push({
      key: 'savingsRate',
      max: HEALTH_COMPONENTS.savingsRate.weight,
      earned,
      formula: `score = 25 × min(savingsRate / targetRate, 1); savingsRate = (income − expenses) / income × 100`,
      detail: `savings rate ${savingsRate}% vs ${targetRate}% target`,
    });
    if (savingsRate >= targetRate) positives.push(`Savings rate of ${savingsRate}% meets your ${targetRate}% target`);
    else if (targetRate - savingsRate >= 5) attention.push(`Savings rate is ${savingsRate}%, ${round2(targetRate - savingsRate)} points below your ${targetRate}% target`);
  } else {
    notes.push('Savings rate excluded — no income recorded this month, so the percentage would be meaningless.');
  }

  // --- 3. Projected budget stability
  if (statuses.length > 0) {
    const overrunCount = statuses.filter((b) => b.projectedOverrun > 0 || b.status === 'RED').length;
    const earned = Math.round((1 - overrunCount / statuses.length) * HEALTH_COMPONENTS.budgetStability.weight * 10) / 10;
    raw.push({
      key: 'budgetStability',
      max: HEALTH_COMPONENTS.budgetStability.weight,
      earned,
      formula: 'score = 20 × (1 − projectedOverruns / totalBudgets)',
      detail: `${overrunCount} of ${statuses.length} budgets projected to overrun`,
    });
    if (overrunCount === 0) positives.push('No budgets are projected to be exceeded this month');
    if (overrunCount > 0) attention.push(`${overrunCount} ${overrunCount === 1 ? 'category is' : 'categories are'} projected to exceed budget`);
  } else {
    notes.push('Budget stability excluded — no budgets defined for this month.');
  }

  // --- 4. Recurring expense burden
  const recurringCost = round2(recurringMonthlyCost || 0);
  if (income > 0) {
    const burden = recurringCost / income; // 0..∞
    // Full marks at ≤10% of income committed; zero at ≥50%.
    const earned = Math.round(clamp((0.5 - burden) / 0.4, 0, 1) * HEALTH_COMPONENTS.recurringBurden.weight * 10) / 10;
    raw.push({
      key: 'recurringBurden',
      max: HEALTH_COMPONENTS.recurringBurden.weight,
      earned,
      formula: 'burden = monthlyRecurring / income; score = 15 × clamp((50% − burden) / 40%, 0, 1)',
      detail: `${fmt(recurringCost, currency)}/month recurring = ${percent(recurringCost, income)}% of income`,
    });
    if (burden <= 0.1) positives.push(`Recurring commitments are a light ${percent(recurringCost, income)}% of income`);
    else if (burden >= 0.3) attention.push(`Recurring commitments consume ${percent(recurringCost, income)}% of income`);
  } else if (recurringCost > 0) {
    notes.push('Recurring burden excluded — monthly income is not set, so the percentage would be meaningless.');
  } else {
    notes.push('Recurring burden excluded — no recurring expenses and no income recorded.');
  }

  // --- 5. Spending consistency (volatility of daily spend)
  if (patterns && patterns.volatility && patterns.volatility.coefficientOfVariation !== null) {
    const cv = patterns.volatility.coefficientOfVariation;
    // cv ≤ 0.5 → full marks; cv ≥ 2.0 → zero.
    const earned = Math.round(clamp((2.0 - cv) / 1.5, 0, 1) * HEALTH_COMPONENTS.consistency.weight * 10) / 10;
    raw.push({
      key: 'consistency',
      max: HEALTH_COMPONENTS.consistency.weight,
      earned,
      formula: 'cv = stddev(dailySpend) / mean(dailySpend); score = 15 × clamp((2.0 − cv) / 1.5, 0, 1)',
      detail: `daily spending variability (cv) = ${cv}`,
    });
    if (cv <= 0.5) positives.push('Daily spending is steady and predictable');
    else if (cv >= 1.5) attention.push('Daily spending swings sharply from day to day');
  } else {
    notes.push('Spending consistency excluded — not enough transaction history to measure volatility.');
  }

  if (raw.length === 0) return { score: null, components: [], positives, attention, notes, insufficientData: true };

  // Redistribute weights proportionally across the applicable components.
  const totalMax = sum(raw.map((c) => c.max));
  const totalEarned = sum(raw.map((c) => c.earned));
  const score = Math.round((totalEarned / totalMax) * 100);

  if (trends && trends.available) {
    const up = trends.categories.filter((c) => c.changePct !== null && c.changePct >= 20 && c.current > 0).slice(0, 2);
    for (const t of up) attention.push(`${t.category} spending is up ${t.changePct}% vs last month`);
    const down = trends.categories.filter((c) => c.changePct !== null && c.changePct <= -20).slice(0, 1);
    for (const t of down) positives.push(`${t.category} spending is down ${Math.abs(t.changePct)}% vs last month`);
  }

  const components = raw.map((c) => ({
    key: c.key,
    label: HEALTH_COMPONENTS[c.key].label,
    earned: c.earned,
    max: c.max,
    weightApplied: Math.round((c.max / totalMax) * 100),
    formula: c.formula,
    detail: c.detail,
    ...(c.perBudget ? { perBudget: c.perBudget } : {}),
  }));

  return { score, components, positives, attention, notes, insufficientData: false, disclaimer: 'SpendGuard Financial Health Indicator — a transparent, self-serve metric computed from your own data. It is not a professional financial assessment.' };
}

// ---------------------------------------------------------------------------
// 10. Insight generation
// ---------------------------------------------------------------------------

/**
 * Turns the engine's computed context into insight objects. Each insight
 * carries: type, severity, title, message, calculatedValues, a one-line
 * formula, a neutral recommendation, and the full five-part explanation that
 * powers the "Why am I seeing this?" dialog:
 *   dataUsed → formula → calculation → result → interpretation.
 *
 * Insights are NEVER generated without the underlying numbers. Where data is
 * insufficient, the function emits an explicit "not enough data" information
 * insight instead of a guess.
 */
function explain({ dataUsed, formula, calculation, result, interpretation }) {
  return { dataUsed, formula, calculation, result, interpretation };
}

function generateInsights(ctx) {
  const {
    now = new Date(),
    currency = 'INR',
    currentSummary,
    previousSummary,
    trends,
    budgetsStatuses,
    micro,
    recurring,
    patterns,
    velocity,
    safeToSpend,
    profile,
  } = ctx;

  const insights = [];
  const push = (i) => insights.push(i);
  const periodKey = monthKey(now);
  const key = (name) => `${name}:${periodKey}`;

  // --- budget-level insights (projection + exceeded)
  for (const b of budgetsStatuses || []) {
    if (b.status === 'RED' && b.spent > b.budgetAmount) {
      push({
        type: 'warning',
        severity: 'high',
        category: b.category,
        title: `${b.category} budget exceeded`,
        message: `You have spent ${fmt(b.spent, currency)} of your ${fmt(b.budgetAmount, currency)} ${b.category} budget — ${fmt(b.spent - b.budgetAmount, currency)} over the limit with ${b.daysRemaining} days left in the month.`,
        calculatedValues: {
          budget: b.budgetAmount,
          spent: b.spent,
          overBy: round2(b.spent - b.budgetAmount),
          utilizationPct: b.utilizationPct,
          daysRemaining: b.daysRemaining,
        },
        formula: 'overBy = spent − budget',
        recommendation: `Review recent ${b.category} transactions to see where the overage came from. You could raise the budget or hold spending steady for the rest of the month — the choice is yours.`,
        explanation: explain({
          dataUsed: [
            `${b.category} budget: ${fmt(b.budgetAmount, currency)}`,
            `Spent so far: ${fmt(b.spent, currency)}`,
            `Days remaining in month: ${b.daysRemaining}`,
          ],
          formula: 'overBy = spent − budget',
          calculation: `${fmt(b.spent, currency)} − ${fmt(b.budgetAmount, currency)} = ${fmt(b.spent - b.budgetAmount, currency)}`,
          result: `Budget exceeded by ${fmt(b.spent - b.budgetAmount, currency)} (${b.utilizationPct}% used)`,
          interpretation: `Actual spending has passed the limit you set for ${b.category}.`,
        }),
        dedupeKey: key(`budget-exceeded:${b.category}`),
      });
    } else if (b.projectedOverrun > 0 && b.spent <= b.budgetAmount) {
      const dailyCatRate = b.daysElapsed > 0 ? round2(b.spent / b.daysElapsed) : 0;
      push({
        type: 'projection',
        severity: 'high',
        category: b.category,
        title: `${b.category} budget may be exceeded by month-end`,
        message: `Projected ${b.category} spending is ${fmt(b.projected, currency)} against a ${fmt(b.budgetAmount, currency)} budget — a potential overrun of ${fmt(b.projectedOverrun, currency)}.`,
        calculatedValues: {
          budget: b.budgetAmount,
          spent: b.spent,
          daysElapsed: b.daysElapsed,
          dailyRate: dailyCatRate,
          daysInMonth: b.daysInMonth,
          projected: b.projected,
          projectedOverrun: b.projectedOverrun,
        },
        formula: 'projected = (spent / daysElapsed) × daysInMonth; overrun = max(projected − budget, 0)',
        recommendation: `Slowing ${b.category} spending slightly now could keep the month within budget. Consider whether the current pace matches your priorities.`,
        explanation: explain({
          dataUsed: [
            `${b.category} budget: ${fmt(b.budgetAmount, currency)}`,
            `Spent so far: ${fmt(b.spent, currency)}`,
            `Days elapsed: ${b.daysElapsed}`,
            `Days in month: ${b.daysInMonth}`,
          ],
          formula: 'projected = (spent / daysElapsed) × daysInMonth',
          calculation: `(${fmt(b.spent, currency)} / ${b.daysElapsed}) × ${b.daysInMonth} = ${fmt(b.projected, currency)} (daily rate ${fmt(dailyCatRate, currency)}/day × ${b.daysInMonth})`,
          result: `Projected spending ${fmt(b.projected, currency)} vs budget ${fmt(b.budgetAmount, currency)} → potential overrun ${fmt(b.projectedOverrun, currency)}`,
          interpretation: `If ${b.category} spending continues at today's pace, you are likely to pass this budget before the month ends.`,
        }),
        dedupeKey: key(`budget-projection:${b.category}`),
      });
    } else if (b.status === 'YELLOW') {
      push({
        type: 'information',
        severity: 'low',
        category: b.category,
        title: `${b.category} budget is ${b.utilizationPct}% used`,
        message: `${fmt(b.remaining, currency)} remains in your ${b.category} budget with ${b.daysRemaining} days to go.`,
        calculatedValues: { budget: b.budgetAmount, spent: b.spent, remaining: b.remaining, utilizationPct: b.utilizationPct, daysRemaining: b.daysRemaining },
        formula: 'utilizationPct = spent / budget × 100',
        recommendation: 'No action required — this is a heads-up that the budget is filling up.',
        explanation: explain({
          dataUsed: [`${b.category} budget: ${fmt(b.budgetAmount, currency)}`, `Spent so far: ${fmt(b.spent, currency)}`],
          formula: 'utilizationPct = spent / budget × 100',
          calculation: `${fmt(b.spent, currency)} / ${fmt(b.budgetAmount, currency)} × 100 = ${b.utilizationPct}%`,
          result: `${b.utilizationPct}% of the budget consumed (YELLOW threshold: 80%)`,
          interpretation: 'You still have room, but the budget is approaching its limit.',
        }),
        dedupeKey: key(`budget-yellow:${b.category}`),
      });
    }
  }

  // --- overall spending velocity
  if (velocity && velocity.expenses > 0 && velocity.onPaceForOverrun) {
    push({
      type: 'projection',
      severity: 'medium',
      category: 'general',
      title: 'Current spending pace projects a month-end overrun',
      message: `You are spending ${fmt(velocity.dailyRate, currency)}/day. At this pace you will add roughly ${fmt(velocity.projectedAdditional, currency)} over the next ${velocity.daysRemaining} days, taking total spending to ${fmt(velocity.projectedTotal, currency)} vs ${fmt(velocity.budget, currency)} of combined budgets.`,
      calculatedValues: {
        expensesSoFar: velocity.expenses,
        daysElapsed: velocity.daysElapsed,
        dailyRate: velocity.dailyRate,
        daysRemaining: velocity.daysRemaining,
        projectedAdditional: velocity.projectedAdditional,
        projectedTotal: velocity.projectedTotal,
        totalBudget: velocity.budget,
        potentialOverrun: velocity.potentialOverrun,
      },
      formula: 'dailyRate = expenses / daysElapsed; projected = expenses + dailyRate × daysRemaining',
      recommendation: 'This is a projection, not a prediction. Look at the budget cards to see which categories are driving the pace.',
      explanation: explain({
        dataUsed: [
          `Month expenses so far: ${fmt(velocity.expenses, currency)}`,
          `Days elapsed: ${velocity.daysElapsed}`,
          `Days remaining (incl. today): ${velocity.daysRemaining}`,
          `Combined budgets: ${fmt(velocity.budget, currency)}`,
        ],
        formula: 'dailyRate = expenses / daysElapsed; projected = expenses + dailyRate × daysRemaining',
        calculation: `${fmt(velocity.expenses, currency)} / ${velocity.daysElapsed} = ${fmt(velocity.dailyRate, currency)}/day; ${fmt(velocity.expenses, currency)} + ${fmt(velocity.dailyRate, currency)} × ${velocity.daysRemaining} = ${fmt(velocity.projectedTotal, currency)}`,
        result: `Projected total ${fmt(velocity.projectedTotal, currency)} vs ${fmt(velocity.budget, currency)} budgeted → potential overrun ${fmt(velocity.potentialOverrun, currency)}`,
        interpretation: 'Your budgeted categories are collectively on pace to exceed their limits before the month ends.',
      }),
      dedupeKey: key('overall-velocity'),
    });
  }

  // --- micro-spending leakage
  if (micro && micro.available && micro.count >= 5 && (micro.shareOfExpenses === null || micro.shareOfExpenses >= 10)) {
    push({
      type: 'leakage',
      severity: micro.shareOfExpenses !== null && micro.shareOfExpenses >= 25 ? 'medium' : 'low',
      category: micro.dominantCategory ? micro.dominantCategory.category : 'general',
      title: `Micro-spending: ${micro.count} small purchases this month`,
      message: `You made ${micro.count} purchases under ${fmt(micro.threshold, currency)} totalling ${fmt(micro.total, currency)} — ${micro.shareOfExpenses !== null ? `${micro.shareOfExpenses}% of this month's spending` : 'a noticeable slice of this month\u2019s spending'}. ${micro.dominantCategory ? `${micro.dominantCategory.category} accounts for ${micro.dominantCategory.share}% of it.` : ''}`,
      calculatedValues: {
        threshold: micro.threshold,
        count: micro.count,
        total: micro.total,
        shareOfExpenses: micro.shareOfExpenses,
        averageValue: micro.averageValue,
        dominantCategory: micro.dominantCategory,
        breakdown: micro.breakdown.slice(0, 5),
      },
      formula: 'shareOfExpenses = microTotal / monthExpenses × 100',
      recommendation: 'Small purchases are not automatically bad spending — this is simply where a meaningful slice of your money is going. Decide for yourself whether the pattern matches your priorities.',
      explanation: explain({
        dataUsed: [
          `Transactions under ${fmt(micro.threshold, currency)} this month: ${micro.count}`,
          `Total month expenses: ${fmt(currentSummary.expenses, currency)}`,
        ],
        formula: 'shareOfExpenses = microTotal / monthExpenses × 100',
        calculation: `${fmt(micro.total, currency)} / ${fmt(currentSummary.expenses, currency)} × 100 = ${micro.shareOfExpenses !== null ? `${micro.shareOfExpenses}%` : 'n/a'} (avg ${fmt(micro.averageValue, currency)} per purchase)`,
        result: `${fmt(micro.total, currency)} across ${micro.count} small purchases${micro.shareOfExpenses !== null ? ` = ${micro.shareOfExpenses}% of monthly spending` : ''}`,
        interpretation: 'These transactions represent a significant portion of your monthly spending. Only you can decide whether that is a problem.',
      }),
      dedupeKey: key('micro-spending'),
    });
  }

  // --- category trends
  if (trends && trends.available) {
    for (const t of trends.categories.filter((c) => c.changePct !== null && Math.abs(c.changePct) >= 15 && c.current >= 100).slice(0, 4)) {
      const up = t.direction === 'up';
      push({
        type: 'trend',
        severity: up && t.changePct >= 30 ? 'medium' : 'low',
        category: t.category,
        title: `${t.category} spending ${up ? 'up' : 'down'} ${Math.abs(t.changePct)}% vs last month`,
        message: `${t.category}: ${fmt(t.current, currency)} this month vs ${fmt(t.previous, currency)} last month (${up ? '+' : ''}${t.changePct}%).`,
        calculatedValues: { current: t.current, previous: t.previous, change: t.change, changePct: t.changePct },
        formula: 'changePct = ((current − previous) / previous) × 100',
        recommendation: up ? 'Worth a look if this category matters to your budget — but a single month is a weak signal on its own.' : 'A decrease worth noticing — check whether it came from a genuine habit change or a timing shift.',
        explanation: explain({
          dataUsed: [`This month ${t.category} expenses: ${fmt(t.current, currency)}`, `Last month ${t.category} expenses: ${fmt(t.previous, currency)}`],
          formula: 'changePct = ((current − previous) / previous) × 100',
          calculation: `(${fmt(t.current, currency)} − ${fmt(t.previous, currency)}) / ${fmt(t.previous, currency)} × 100 = ${t.changePct}%`,
          result: `${up ? 'Increase' : 'Decrease'} of ${fmt(Math.abs(t.change), currency)} (${t.changePct}%)`,
          interpretation: `Your ${t.category} spending is running noticeably ${up ? 'higher' : 'lower'} than the previous month.`,
        }),
        dedupeKey: key(`trend:${t.category}`),
      });
    }
  }

  // --- recurring expenses
  if (recurring && recurring.committed.length > 0) {
    const top = recurring.committed.slice(0, 3).map((c) => c.name).join(', ');
    const incomeForPct = currentSummary.income > 0 ? currentSummary.income : Number(profile?.monthlyIncome) || 0;
    push({
      type: 'information',
      severity: 'low',
      category: 'Subscriptions',
      title: `${recurring.committed.length} recurring ${recurring.committed.length === 1 ? 'expense' : 'expenses'} detected`,
      message: `Repeating expenses such as ${top} add up to about ${fmt(recurring.monthlyRecurringCost, currency)} per month — ${fmt(recurring.annualRecurringCost, currency)} per year.${incomeForPct > 0 ? ` That is ${percent(recurring.monthlyRecurringCost, incomeForPct)}% of your monthly income.` : ''}`,
      calculatedValues: {
        items: recurring.committed.map((c) => ({ name: c.name, amount: c.amount, frequency: c.frequency, monthlyCost: c.monthlyCost })),
        monthlyRecurringCost: recurring.monthlyRecurringCost,
        annualRecurringCost: recurring.annualRecurringCost,
        percentOfIncome: incomeForPct > 0 ? percent(recurring.monthlyRecurringCost, incomeForPct) : null,
      },
      formula: 'annual = monthly × 12; percentOfIncome = monthlyRecurring / income × 100',
      recommendation: 'Recurring costs are easy to forget because they are automatic. Review the list on the Recurring page and cancel anything you no longer use.',
      explanation: explain({
        dataUsed: recurring.committed.map((c) => `${c.name}: ${fmt(c.amount, currency)} × ${c.occurrenceCount} occurrences, ~${c.medianGapDays}-day gaps`),
        formula: 'monthlyCost = amount / monthsPerCycle; annual = monthlyCost × 12',
        calculation: recurring.committed.map((c) => `${c.name} ≈ ${fmt(c.monthlyCost, currency)}/mo`).join(' + ') + ` = ${fmt(recurring.monthlyRecurringCost, currency)}/mo × 12 = ${fmt(recurring.annualRecurringCost, currency)}/yr`,
        result: `${fmt(recurring.monthlyRecurringCost, currency)} per month / ${fmt(recurring.annualRecurringCost, currency)} per year`,
        interpretation: 'A meaningful share of your spending happens automatically on a repeating schedule.',
      }),
      dedupeKey: key('recurring-summary'),
    });
    if (incomeForPct > 0 && recurring.monthlyRecurringCost / incomeForPct >= 0.3) {
      push({
        type: 'warning',
        severity: 'medium',
        category: 'Subscriptions',
        title: 'Recurring expenses take a large share of income',
        message: `Recurring commitments of ${fmt(recurring.monthlyRecurringCost, currency)} equal ${percent(recurring.monthlyRecurringCost, incomeForPct)}% of your monthly income.`,
        calculatedValues: { monthlyRecurringCost: recurring.monthlyRecurringCost, income: incomeForPct, percentOfIncome: percent(recurring.monthlyRecurringCost, incomeForPct) },
        formula: 'percentOfIncome = monthlyRecurring / income × 100',
        recommendation: 'There is no fixed rule for how much is too much — but recurring costs deserve a deliberate review since they continue whether or not you use them.',
        explanation: explain({
          dataUsed: [`Monthly recurring total: ${fmt(recurring.monthlyRecurringCost, currency)}`, `Monthly income: ${fmt(incomeForPct, currency)}`],
          formula: 'percentOfIncome = monthlyRecurring / income × 100',
          calculation: `${fmt(recurring.monthlyRecurringCost, currency)} / ${fmt(incomeForPct, currency)} × 100 = ${percent(recurring.monthlyRecurringCost, incomeForPct)}%`,
          result: `${percent(recurring.monthlyRecurringCost, incomeForPct)}% of income is committed before any discretionary spending`,
          interpretation: 'A large fixed commitment reduces flexibility for the rest of the month.',
        }),
        dedupeKey: key('recurring-burden'),
      });
    }
  }

  // --- behavioural patterns
  if (patterns && patterns.available && patterns.weekendVsWeekday.available && Math.abs(patterns.weekendVsWeekday.differencePct) >= 15) {
    const wv = patterns.weekendVsWeekday;
    const higher = wv.differencePct > 0;
    push({
      type: 'trend',
      severity: 'low',
      category: 'general',
      title: `Weekend spending is ${Math.abs(wv.differencePct)}% ${higher ? 'higher' : 'lower'} than weekdays`,
      message: `Your average daily spending is ${fmt(wv.weekendAvg, currency)} on weekends vs ${fmt(wv.weekdayAvg, currency)} on weekdays (${higher ? '+' : ''}${wv.differencePct}%).`,
      calculatedValues: { weekendAvgDaily: wv.weekendAvg, weekdayAvgDaily: wv.weekdayAvg, differencePct: wv.differencePct, weekendDays: wv.weekendDays, weekdayDays: wv.weekdayDays },
      formula: 'differencePct = ((weekendAvgDaily − weekdayAvgDaily) / weekdayAvgDaily) × 100',
      recommendation: 'Patterns like this are context, not judgement — they can help you plan which days deserve more budget attention.',
      explanation: explain({
        dataUsed: [`Average weekend day spend: ${fmt(wv.weekendAvg, currency)} (over ${wv.weekendDays} weekend days)`, `Average weekday spend: ${fmt(wv.weekdayAvg, currency)} (over ${wv.weekdayDays} weekdays)`],
        formula: 'differencePct = ((weekendAvgDaily − weekdayAvgDaily) / weekdayAvgDaily) × 100',
        calculation: `(${fmt(wv.weekendAvg, currency)} − ${fmt(wv.weekdayAvg, currency)}) / ${fmt(wv.weekdayAvg, currency)} × 100 = ${wv.differencePct}%`,
        result: `Weekends run ${Math.abs(wv.differencePct)}% ${higher ? 'above' : 'below'} weekday pace`,
        interpretation: 'Your spending rhythm differs between weekdays and weekends.',
      }),
      dedupeKey: key('weekend-pattern'),
    });
  }

  // --- savings rate vs target
  if (currentSummary.income > 0 && currentSummary.savingsRate !== null) {
    const target = Number(profile?.targetSavingsRate) || 20;
    const diff = round2(currentSummary.savingsRate - target);
    if (diff <= -5) {
      push({
        type: 'warning',
        severity: 'medium',
        category: 'general',
        title: 'Savings are below your target',
        message: `Savings rate this month is ${currentSummary.savingsRate}% against your ${target}% target (${fmt(Math.abs(diff), currency)}-worth of income short per month at current levels).`,
        calculatedValues: { income: currentSummary.income, expenses: currentSummary.expenses, savings: currentSummary.savings, savingsRate: currentSummary.savingsRate, target, gap: diff },
        formula: 'savingsRate = (income − expenses) / income × 100; gap = savingsRate − target',
        recommendation: 'You set this target — if it still fits your situation, the budget cards show where spending is concentrated; if not, adjusting the target in Profile is equally valid.',
        explanation: explain({
          dataUsed: [`Income: ${fmt(currentSummary.income, currency)}`, `Expenses: ${fmt(currentSummary.expenses, currency)}`, `Your target savings rate: ${target}%`],
          formula: 'savingsRate = (income − expenses) / income × 100',
          calculation: `(${fmt(currentSummary.income, currency)} − ${fmt(currentSummary.expenses, currency)}) / ${fmt(currentSummary.income, currency)} × 100 = ${currentSummary.savingsRate}%`,
          result: `${currentSummary.savingsRate}% vs ${target}% target → ${diff >= 0 ? 'ahead' : 'behind'} by ${Math.abs(diff)} points`,
          interpretation: 'You are saving less than the rate you asked SpendGuard to track against.',
        }),
        dedupeKey: key('savings-gap'),
      });
    } else if (diff >= 0) {
      push({
        type: 'positive',
        severity: 'low',
        category: 'general',
        title: 'Savings target on track',
        message: `Savings rate this month is ${currentSummary.savingsRate}%, meeting or beating your ${target}% target.`,
        calculatedValues: { income: currentSummary.income, expenses: currentSummary.expenses, savings: currentSummary.savings, savingsRate: currentSummary.savingsRate, target, gap: diff },
        formula: 'savingsRate = (income − expenses) / income × 100',
        recommendation: 'Nothing needed — this is a confirmation that the month is tracking to your own goal.',
        explanation: explain({
          dataUsed: [`Income: ${fmt(currentSummary.income, currency)}`, `Expenses: ${fmt(currentSummary.expenses, currency)}`],
          formula: 'savingsRate = (income − expenses) / income × 100',
          calculation: `(${fmt(currentSummary.income, currency)} − ${fmt(currentSummary.expenses, currency)}) / ${fmt(currentSummary.income, currency)} × 100 = ${currentSummary.savingsRate}%`,
          result: `${currentSummary.savingsRate}% ≥ ${target}% target`,
          interpretation: 'Your income minus expenses meets the savings rate you set for yourself.',
        }),
        dedupeKey: key('savings-ontrack'),
      });
    }
  }

  // --- safe-to-spend warning when negative
  if (safeToSpend && safeToSpend.perDay !== null && safeToSpend.available < 0) {
    push({
      type: 'warning',
      severity: 'high',
      category: 'general',
      title: 'Projected spending exceeds available budget',
      message: `After subtracting spending so far from your budgets/recurring commitments, the estimate for the rest of the month is negative (${fmt(safeToSpend.available, currency)}), i.e. about ${fmt(safeToSpend.perDay, currency)}/day would need to be recovered.`,
      calculatedValues: { available: safeToSpend.available, perDay: safeToSpend.perDay, remainingDays: safeToSpend.remainingDays, basis: safeToSpend.basis },
      formula: 'available = budgetBasis − spent; perDay = available / daysRemaining',
      recommendation: 'The estimate only counts what you have told SpendGuard — check the budget cards and recurring list to see which commitments drive it.',
      explanation: explain({
        dataUsed: [`Basis: ${safeToSpend.basis}`, `Available after spending so far: ${fmt(safeToSpend.available, currency)}`, `Days remaining: ${safeToSpend.remainingDays}`],
        formula: safeToSpend.formula,
        calculation: `${fmt(safeToSpend.available, currency)} / ${safeToSpend.remainingDays} = ${fmt(safeToSpend.perDay, currency)}/day`,
        result: `Negative headroom of ${fmt(Math.abs(safeToSpend.available), currency)}`,
        interpretation: 'Based on your current budgets and commitments, the month is estimated to finish over plan.',
      }),
      dedupeKey: key('safe-to-spend-negative'),
    });
  }

  // --- honest low-data notice when there is almost nothing to analyse
  if (currentSummary.transactionCount === 0) {
    push({
      type: 'information',
      severity: 'low',
      category: 'general',
      title: 'No transactions for this month yet',
      message: 'SpendGuard generates insights from your own transaction data. Add a few transactions and this space will start showing spending patterns, projections and trends.',
      calculatedValues: {},
      formula: 'n/a — no data',
      recommendation: 'Record this month’s expenses and budgets to activate the intelligence engine.',
      explanation: explain({
        dataUsed: ['Transactions this month: 0'],
        formula: 'n/a — no data',
        calculation: 'n/a — no data',
        result: 'No insight can be computed from zero transactions',
        interpretation: 'SpendGuard does not invent insights when there is no data to base them on.',
      }),
      dedupeKey: key('no-data'),
    });
  }

  return insights;
}

module.exports = {
  fmt,
  CURRENCY_SYMBOLS,
  BUDGET_THRESHOLDS,
  HEALTH_COMPONENTS,
  MIN_EXPENSE_TX_FOR_PATTERNS,
  computePeriodSummary,
  computeBudgetStatus,
  computeSpendingVelocity,
  computeSafeToSpend,
  detectMicroSpending,
  computeCategoryTrends,
  detectRecurringExpenses,
  analyzeSpendingPatterns,
  computeFinancialHealth,
  generateInsights,
};
