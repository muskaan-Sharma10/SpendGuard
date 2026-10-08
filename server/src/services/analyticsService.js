'use strict';

/**
 * Analytics orchestration.
 *
 * This service is the ONLY place that assembles the full analytical context:
 * it loads the user's raw data, hands it to the pure SpendingIntelligenceEngine,
 * and shapes the results for the API. Keeping orchestration here means the
 * engine stays pure and each endpoint is a one-line composition.
 */

const Transaction = require('../models/Transaction');
const engine = require('../analytics/SpendingIntelligenceEngine');
const budgetService = require('./budgetService');
const recurringService = require('./recurringService');
const insightService = require('./insightService');
const env = require('../config/env');
const { monthRange, previousMonthRange, monthKey, elapsedDaysInMonth } = require('../utils/dateUtils');

async function loadContext(userId, { now = new Date() } = {}) {
  const transactions = await Transaction.find({ userId }).lean();

  const current = monthRange(now);
  const previous = previousMonthRange(now);

  const currentSummary = engine.computePeriodSummary(transactions, { start: current.start, end: current.end });
  const previousSummary = engine.computePeriodSummary(transactions, { start: previous.start, end: previous.end });

  return { transactions, currentSummary, previousSummary, current, previous };
}

/** Raw month data shared by several endpoints. */
async function getMonthContext(userId, { now = new Date(), profile } = {}) {
  const transactions = await Transaction.find({ userId }).lean();
  const current = monthRange(now);
  const previous = previousMonthRange(now);

  const currentSummary = engine.computePeriodSummary(transactions, { start: current.start, end: current.end });
  const previousSummary = engine.computePeriodSummary(transactions, { start: previous.start, end: previous.end });

  // Like-for-like window: the same day range of the previous month. Comparing
  // a day-5 partial month against a full month would systematically show fake
  // "−80%" declines, so trend endpoints use this window instead.
  const elapsed = elapsedDaysInMonth(now);
  const previousMtdEnd = new Date(
    Math.min(previous.start.getTime() + elapsed * 86_400_000, previous.end.getTime())
  );
  const previousMtdSummary = engine.computePeriodSummary(transactions, {
    start: previous.start,
    end: previousMtdEnd,
  });

  const recurringRecords = await recurringService.listRecurring(userId);
  const recurringTotals = recurringService.computeTotals(recurringRecords);

  return {
    transactions,
    profile,
    now,
    currency: profile?.currency || 'INR',
    currentSummary,
    previousSummary,
    previousMtdSummary,
    current,
    previous,
    recurringRecords,
    recurringTotals,
  };
}

const TREND_LABEL = 'month-to-date vs same period last month';

/** GET /api/analytics/overview — dashboard payload. */
async function getOverview(userId, { now = new Date(), profile } = {}) {
  const ctx = await getMonthContext(userId, { now, profile });
  const { transactions, currentSummary, previousSummary, previousMtdSummary, currency, recurringTotals } = ctx;

  const budgetsWithStatus = await budgetService.getBudgetsWithStatus(userId, { now, profile, recurringRecords: ctx.recurringRecords });
  const totalBudget = budgetsWithStatus.items.reduce((acc, b) => acc + b.budgetAmount, 0);

  const velocity = engine.computeSpendingVelocity({
    expenses: currentSummary.expenses,
    budget: totalBudget > 0 ? totalBudget : null,
    now,
  });

  const micro = engine.detectMicroSpending({
    transactions,
    threshold: env.analytics.microSpendThreshold,
    totalExpenses: currentSummary.expenses,
    now,
  });

  const patterns = engine.analyzeSpendingPatterns({
    transactions,
    minDays: env.analytics.minDaysForPatterns,
    now,
  });

  const trends = engine.computeCategoryTrends(currentSummary, previousMtdSummary || previousSummary, { comparisonLabel: TREND_LABEL });

  const health = engine.computeFinancialHealth({
    currentSummary,
    budgetsStatuses: budgetsWithStatus.items,
    recurringMonthlyCost: recurringTotals.monthlyTotal,
    patterns,
    profile,
    trends,
  });

  const safeToSpend = engine.computeSafeToSpend({
    transactions,
    budgets: budgetsWithStatus.items,
    recurringMonthlyCost: recurringTotals.monthlyTotal,
    profile,
    now,
  });

  // 6-month income/expense history for the trend chart.
  const history = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const { start, end } = monthRange(d);
    const s = engine.computePeriodSummary(transactions, { start, end });
    history.push({ month: monthKey(d), income: s.income, expenses: s.expenses, savings: s.savings });
  }

  return {
    month: monthKey(now),
    currency,
    totals: {
      income: currentSummary.income,
      expenses: currentSummary.expenses,
      savings: currentSummary.savings,
      savingsRate: currentSummary.savingsRate,
      transactionCount: currentSummary.transactionCount,
      balance: engine.fmt ? roundBalance(transactions) : 0,
    },
    safeToSpend,
    velocity,
    budgets: budgetsWithStatus,
    categories: currentSummary.categories,
    dailySeries: currentSummary.dailySeries,
    monthlyHistory: history,
    trends,
    microSpending: micro,
    patterns,
    recurring: {
      monthlyTotal: recurringTotals.monthlyTotal,
      annualTotal: recurringTotals.annualTotal,
      count: recurringTotals.activeCount,
    },
    health,
  };
}

function roundBalance(transactions) {
  const balance = transactions.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);
  return Math.round(balance * 100) / 100;
}

/** GET /api/analytics/trends — month-over-month movement incl. savings trend. */
async function getTrends(userId, { now = new Date(), profile } = {}) {
  const ctx = await getMonthContext(userId, { now, profile });
  const { transactions, currentSummary, previousSummary, previousMtdSummary } = ctx;

  const trends = engine.computeCategoryTrends(currentSummary, previousMtdSummary || previousSummary, { comparisonLabel: TREND_LABEL });

  const history = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const { start, end } = monthRange(d);
    const s = engine.computePeriodSummary(transactions, { start, end });
    history.push({
      month: monthKey(d),
      income: s.income,
      expenses: s.expenses,
      savings: s.savings,
      savingsRate: s.savingsRate,
    });
  }

  const patterns = engine.analyzeSpendingPatterns({
    transactions,
    minDays: env.analytics.minDaysForPatterns,
    now,
  });

  return { trends, monthlyHistory: history, patterns };
}

/** GET /api/analytics/categories — current vs previous month per category. */
async function getCategories(userId, { now = new Date() } = {}) {
  const transactions = await Transaction.find({ userId }).lean();
  const current = monthRange(now);
  const previous = previousMonthRange(now);
  const currentSummary = engine.computePeriodSummary(transactions, { start: current.start, end: current.end });
  const previousSummary = engine.computePeriodSummary(transactions, { start: previous.start, end: previous.end });
  const elapsed = elapsedDaysInMonth(now);
  const previousMtdEnd = new Date(Math.min(previous.start.getTime() + elapsed * 86_400_000, previous.end.getTime()));
  const previousMtdSummary = engine.computePeriodSummary(transactions, { start: previous.start, end: previousMtdEnd });
  return engine.computeCategoryTrends(currentSummary, previousMtdSummary || previousSummary, { comparisonLabel: TREND_LABEL });
}

/**
 * GET /api/analytics/insights — regenerate insights from live data, persist
 * them, and return the full list ordered by severity.
 */
async function getInsights(userId, { now = new Date(), profile, persist = true } = {}) {
  const ctx = await getMonthContext(userId, { now, profile });
  const { transactions, currentSummary, previousSummary, previousMtdSummary, currency, recurringTotals } = ctx;

  const budgetsWithStatus = await budgetService.getBudgetsWithStatus(userId, { now, profile, recurringRecords: ctx.recurringRecords });
  const totalBudget = budgetsWithStatus.items.reduce((acc, b) => acc + b.budgetAmount, 0);

  const velocity = engine.computeSpendingVelocity({
    expenses: currentSummary.expenses,
    budget: totalBudget > 0 ? totalBudget : null,
    now,
  });
  const micro = engine.detectMicroSpending({
    transactions,
    threshold: env.analytics.microSpendThreshold,
    totalExpenses: currentSummary.expenses,
    now,
  });
  const patterns = engine.analyzeSpendingPatterns({ transactions, minDays: env.analytics.minDaysForPatterns, now });
  const trends = engine.computeCategoryTrends(currentSummary, previousMtdSummary || previousSummary, { comparisonLabel: TREND_LABEL });
  const detection = await recurringService.runDetection(userId, { now });
  const recurring = await recurringService.listRecurring(userId);
  const committedFromDb = recurring
    .filter((r) => r.status === 'active' || r.status === 'suggested')
    .map((r) => {
      const monthsPerCycle = { weekly: 52 / 12, monthly: 1, quarterly: 3, yearly: 12 }[r.frequency] || 1;
      return {
        name: r.name,
        amount: r.amount,
        frequency: r.frequency,
        monthlyCost: Math.round((r.amount / monthsPerCycle) * 100) / 100,
        occurrenceCount: r.evidence?.occurrenceCount || 0,
        medianGapDays: null,
      };
    });
  const monthlyFromDb = Math.round(committedFromDb.reduce((a, c) => a + c.monthlyCost, 0) * 100) / 100;

  const safeToSpend = engine.computeSafeToSpend({
    transactions,
    budgets: budgetsWithStatus.items,
    recurringMonthlyCost: monthlyFromDb,
    profile,
    now,
  });

  const drafts = engine.generateInsights({
    now,
    currency,
    currentSummary,
    previousSummary,
    trends,
    budgetsStatuses: budgetsWithStatus.items,
    micro,
    recurring: {
      committed: committedFromDb,
      monthlyRecurringCost: monthlyFromDb,
      annualRecurringCost: Math.round(monthlyFromDb * 12 * 100) / 100,
    },
    patterns,
    velocity,
    safeToSpend,
    profile,
  });

  const withPeriod = drafts.map((d) => ({ ...d, periodKey: monthKey(now) }));
  if (persist) await insightService.persistInsights(userId, withPeriod);

  const severityOrder = { high: 0, medium: 1, low: 2 };
  return withPeriod.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));
}

/** GET /api/analytics/financial-health */
async function getFinancialHealth(userId, { now = new Date(), profile } = {}) {
  const ctx = await getMonthContext(userId, { now, profile });
  const { transactions, currentSummary, previousSummary, previousMtdSummary, recurringTotals } = ctx;

  const budgetsWithStatus = await budgetService.getBudgetsWithStatus(userId, { now, profile, recurringRecords: ctx.recurringRecords });
  const patterns = engine.analyzeSpendingPatterns({ transactions, minDays: env.analytics.minDaysForPatterns, now });
  const trends = engine.computeCategoryTrends(currentSummary, previousMtdSummary || previousSummary, { comparisonLabel: TREND_LABEL });

  return engine.computeFinancialHealth({
    currentSummary,
    budgetsStatuses: budgetsWithStatus.items,
    recurringMonthlyCost: recurringTotals.monthlyTotal,
    patterns,
    profile,
    trends,
  });
}

module.exports = {
  loadContext,
  getMonthContext,
  getOverview,
  getTrends,
  getCategories,
  getInsights,
  getFinancialHealth,
};
