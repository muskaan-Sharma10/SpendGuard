'use strict';

/**
 * Unit tests for the SpendingIntelligenceEngine (pure functions, no DB).
 */

const engine = require('../src/analytics/SpendingIntelligenceEngine');
const { parseDay } = require('../src/utils/dateUtils');

const noonOn = (day) => new Date(parseDay(day).getTime() + 12 * 3600 * 1000);

const tx = (amount, type, category, date, extra = {}) => ({ amount, type, category, date, merchant: extra.merchant || '', note: '', paymentMethod: 'UPI', ...extra });

describe('computePeriodSummary', () => {
  const start = parseDay('2026-10-01');
  const end = parseDay('2026-11-01');

  it('sums income, expenses, savings and savings rate', () => {
    const s = engine.computePeriodSummary(
      [
        tx(1000, 'income', 'Other', '2026-10-01'),
        tx(300, 'expense', 'Food', '2026-10-05'),
        tx(200, 'expense', 'Food', '2026-10-07'),
      ],
      { start, end }
    );
    expect(s.income).toBe(1000);
    expect(s.expenses).toBe(500);
    expect(s.savings).toBe(500);
    expect(s.savingsRate).toBe(50);
  });

  it('returns null savings rate when income is zero (never a fake percentage)', () => {
    const s = engine.computePeriodSummary([tx(300, 'expense', 'Food', '2026-10-05')], { start, end });
    expect(s.income).toBe(0);
    expect(s.savingsRate).toBeNull();
  });

  it('excludes transactions outside the window', () => {
    const s = engine.computePeriodSummary([tx(999, 'expense', 'Food', '2026-09-30')], { start, end });
    expect(s.transactionCount).toBe(0);
    expect(s.expenses).toBe(0);
  });
});

describe('computeBudgetStatus (projection)', () => {
  const budget = { id: 'b1', category: 'Food', amount: 5000, month: '2026-10' };

  it('matches the worked example: 3200 spent by day 18 of a 31-day month', () => {
    const status = engine.computeBudgetStatus({ budget, spent: 3200, now: noonOn('2026-10-18') });
    expect(status.daysElapsed).toBe(18);
    // 3200 / 18 × 31 = 5511.11
    expect(status.projected).toBeCloseTo(5511.11, 1);
    expect(status.status).toBe('RED'); // projected > budget
  });

  it('shows GREEN when spending is comfortably within budget', () => {
    const status = engine.computeBudgetStatus({ budget, spent: 1000, now: noonOn('2026-10-18') });
    expect(status.status).toBe('GREEN');
  });

  it('shows YELLOW when utilization crosses the 80% threshold', () => {
    const status = engine.computeBudgetStatus({ budget, spent: 4500, now: noonOn('2026-10-30') });
    expect(status.utilizationPct).toBe(90);
    expect(status.status).toBe('YELLOW');
  });

  it('shows RED immediately when the budget is already exceeded', () => {
    const status = engine.computeBudgetStatus({ budget, spent: 5200, now: noonOn('2026-10-10') });
    expect(status.status).toBe('RED');
    expect(status.projectedOverrun).toBeGreaterThanOrEqual(0);
  });

  it('handles zero spending (never divides by elapsed for zero spend)', () => {
    const status = engine.computeBudgetStatus({ budget, spent: 0, now: noonOn('2026-10-10') });
    expect(status.projected).toBe(0);
    expect(status.status).toBe('GREEN');
  });

  it('counts fixed commitments at their known cost instead of extrapolating them', () => {
    // 4000 rent paid on day 2 of 5; fixed 5298/month.
    // Naive: 4000/5×31 = 24800. With the fixed split: 5298.
    const status = engine.computeBudgetStatus({
      budget: { id: 'b', category: 'Bills', amount: 7000, month: '2026-10' },
      spent: 4000,
      recurringMonthlyForCategory: 5298,
      now: noonOn('2026-10-05'),
    });
    expect(status.projected).toBe(5298);
    expect(status.variableSpent).toBe(0);
    expect(status.status).toBe('GREEN');
  });
});

describe('computeSpendingVelocity', () => {
  it('matches the worked velocity example', () => {
    const v = engine.computeSpendingVelocity({
      expenses: 3600,
      budget: 5000,
      now: noonOn('2026-10-18'),
    });
    expect(v.dailyRate).toBe(200); // 3600 / 18
    // 3600 + 200 × 14 (remaining days incl. today in a 31-day month)
    expect(v.projectedTotal).toBe(6400);
    expect(v.potentialOverrun).toBe(1400);
    expect(v.onPaceForOverrun).toBe(true);
  });

  it('handles zero expenses and zero elapsed gracefully', () => {
    const v = engine.computeSpendingVelocity({ expenses: 0, budget: 5000, now: noonOn('2026-10-01') });
    expect(v.dailyRate).toBe(0);
    expect(v.potentialOverrun).toBe(0);
  });

  it('returns null-based overrun when no budget exists', () => {
    const v = engine.computeSpendingVelocity({ expenses: 3600, budget: null, now: noonOn('2026-10-18') });
    expect(v.potentialOverrun).toBeNull();
    expect(v.onPaceForOverrun).toBe(false);
  });
});

describe('detectMicroSpending', () => {
  it('counts only expenses below the threshold and computes the dominant category', () => {
    const transactions = [
      tx(50, 'expense', 'Food', '2026-10-01'),
      tx(80, 'expense', 'Food', '2026-10-02'),
      tx(100, 'expense', 'Transport', '2026-10-02'),
      tx(500, 'expense', 'Shopping', '2026-10-03'),
    ];
    const m = engine.detectMicroSpending({ transactions, threshold: 200, totalExpenses: 730, now: noonOn('2026-10-05') });
    expect(m.count).toBe(3);
    expect(m.total).toBe(230);
    expect(m.shareOfExpenses).toBe(32); // 230/730 = 31.5 → 32
    expect(m.dominantCategory.category).toBe('Food');
    expect(m.averageValue).toBeCloseTo(76.67, 1);
  });

  it('is unavailable with no transactions', () => {
    const m = engine.detectMicroSpending({ transactions: [], threshold: 200, totalExpenses: 0, now: noonOn('2026-10-05') });
    expect(m.available).toBe(false);
    expect(m.count).toBe(0);
  });
});

describe('computeCategoryTrends', () => {
  const mk = (cat, exp) => ({ category: cat, expenses: exp, income: 0, count: 1 });

  it('computes percentage change', () => {
    const t = engine.computeCategoryTrends(
      { categories: [mk('Food', 5000)] },
      { categories: [mk('Food', 3937)], expenses: 5000 }
    );
    expect(t.available).toBe(true);
    const food = t.categories.find((c) => c.category === 'Food');
    expect(food.changePct).toBe(27);
  });

  it('never divides by zero when previous-month spending is zero', () => {
    const t = engine.computeCategoryTrends(
      { categories: [mk('Food', 5000)] },
      { categories: [], expenses: 0 }
    );
    expect(t.available).toBe(false);
    expect(t.reason).toMatch(/Comparison unavailable/);
  });

  it('marks new categories as isNew with null percentage', () => {
    const t = engine.computeCategoryTrends(
      { categories: [mk('Travel', 1200)] },
      { categories: [mk('Food', 3000)], expenses: 3000 }
    );
    const travel = t.categories.find((c) => c.category === 'Travel');
    expect(travel.isNew).toBe(true);
    expect(travel.changePct).toBeNull();
  });
});

describe('detectRecurringExpenses', () => {
  it('detects a monthly subscription from consistent merchant/amount patterns', () => {
    const transactions = [];
    // 4 monthly Netflix charges 649 on ~the 5th, spread over 90+ days
    for (const [m, d] of [[6, 5], [7, 6], [8, 5], [9, 5]]) {
      transactions.push(tx(649, 'expense', 'Subscriptions', `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, { merchant: 'Netflix' }));
    }
    const r = engine.detectRecurringExpenses({ transactions, minDaysForRecurring: 60, now: noonOn('2026-10-05') });
    expect(r.available).toBe(true);
    const netflix = r.committed.find((c) => c.name === 'Netflix');
    expect(netflix).toBeTruthy();
    expect(netflix.frequency).toBe('monthly');
    expect(netflix.confidence).toBe('high');
    expect(netflix.annualCost).toBeCloseTo(649 * 12, 0);
  });

  it('does not classify a one-time purchase as recurring', () => {
    const r = engine.detectRecurringExpenses({
      transactions: [tx(1200, 'expense', 'Shopping', '2026-09-01', { merchant: 'Amazon' })],
      minDaysForRecurring: 60,
      now: noonOn('2026-10-05'),
    });
    expect(r.committed).toHaveLength(0);
    expect(r.available).toBe(false);
  });

  it('reports insufficient history honestly when the span is short', () => {
    const transactions = [
      tx(649, 'expense', 'Subscriptions', '2026-10-01', { merchant: 'Netflix' }),
      tx(649, 'expense', 'Subscriptions', '2026-10-03', { merchant: 'Netflix' }),
    ];
    const r = engine.detectRecurringExpenses({ transactions, minDaysForRecurring: 60, now: noonOn('2026-10-05') });
    expect(r.hasSufficientHistory).toBe(false);
    expect(r.insufficientHistoryMessage).toMatch(/Not enough transaction history/);
  });
});

describe('analyzeSpendingPatterns (data-sufficiency guards)', () => {
  it('refuses to claim patterns with thin data', () => {
    const p = engine.analyzeSpendingPatterns({
      transactions: [tx(100, 'expense', 'Food', '2026-10-01'), tx(120, 'expense', 'Food', '2026-10-02')],
      minDays: 14,
      now: noonOn('2026-10-05'),
    });
    expect(p.available).toBe(false);
    expect(p.reason).toMatch(/Not enough historical data/);
    expect(p.weekendVsWeekday).toBeNull();
  });

  it('detects a weekend-heavy pattern when history is sufficient', () => {
    const transactions = [];
    // Weekends in Oct 2026: 3,4,10,11,17,18,24,25,31 — heavy spend; weekdays light.
    for (const d of [3, 4, 10, 11, 17, 18, 24, 25]) {
      transactions.push(tx(800, 'expense', 'Entertainment', `2026-10-${String(d).padStart(2, '0')}`));
    }
    for (const d of [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29]) {
      transactions.push(tx(200, 'expense', 'Food', `2026-10-${String(d).padStart(2, '0')}`));
    }
    const p = engine.analyzeSpendingPatterns({ transactions, minDays: 14, now: noonOn('2026-11-01') });
    expect(p.available).toBe(true);
    expect(p.weekendVsWeekday.available).toBe(true);
    expect(p.weekendVsWeekday.differencePct).toBeGreaterThan(100);
  });
});

describe('computeFinancialHealth', () => {
  const baseSummary = { income: 30000, expenses: 20000, savings: 10000, savingsRate: 33, categories: [], transactionCount: 30 };

  it('is deterministic and within 0-100', () => {
    const budgets = [
      { category: 'Food', budgetAmount: 5000, spent: 2000, utilizationPct: 40, status: 'GREEN', projectedOverrun: 0, remaining: 3000, daysElapsed: 15, daysRemaining: 16, daysInMonth: 31, projected: 4000 },
    ];
    const a = engine.computeFinancialHealth({
      currentSummary: baseSummary,
      budgetsStatuses: budgets,
      recurringMonthlyCost: 2000,
      patterns: { volatility: { coefficientOfVariation: 0.6 } },
      profile: { targetSavingsRate: 20 },
      trends: null,
    });
    const b = engine.computeFinancialHealth({
      currentSummary: baseSummary,
      budgetsStatuses: budgets,
      recurringMonthlyCost: 2000,
      patterns: { volatility: { coefficientOfVariation: 0.6 } },
      profile: { targetSavingsRate: 20 },
      trends: null,
    });
    expect(a.score).toBe(b.score);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });

  it('excludes and redistributes the savings component when income is zero', () => {
    const result = engine.computeFinancialHealth({
      currentSummary: { ...baseSummary, income: 0, savingsRate: null },
      budgetsStatuses: [{ category: 'Food', budgetAmount: 5000, spent: 1000, utilizationPct: 20, status: 'GREEN', projectedOverrun: 0, daysElapsed: 15, daysRemaining: 16, daysInMonth: 31, projected: 2000 }],
      recurringMonthlyCost: 0,
      patterns: { volatility: { coefficientOfVariation: 0.6 } },
      profile: { targetSavingsRate: 20 },
      trends: null,
    });
    expect(result.components.find((c) => c.key === 'savingsRate')).toBeUndefined();
    expect(result.notes.join(' ')).toMatch(/no income/i);
    // Weight redistribution: remaining weights must sum to 100%
    const weightSum = result.components.reduce((acc, c) => acc + c.weightApplied, 0);
    expect(weightSum).toBe(100);
  });

  it('returns null when nothing at all can be computed', () => {
    const result = engine.computeFinancialHealth({
      currentSummary: { income: 0, expenses: 0, savings: 0, savingsRate: null, categories: [] },
      budgetsStatuses: [],
      recurringMonthlyCost: 0,
      patterns: null,
      profile: {},
      trends: null,
    });
    expect(result.score).toBeNull();
    expect(result.insufficientData).toBe(true);
  });
});

describe('generateInsights (trust contract)', () => {
  it('every insight carries a full explanation', () => {
    const drafts = engine.generateInsights({
      now: noonOn('2026-10-18'),
      currency: 'INR',
      currentSummary: { income: 30000, expenses: 12000, savings: 18000, savingsRate: 60, categories: [], transactionCount: 40 },
      previousSummary: { income: 30000, expenses: 10000, savings: 20000, savingsRate: 66, categories: [{ category: 'Food', expenses: 3000, income: 0, count: 10 }] },
      trends: { available: true, categories: [{ category: 'Food', current: 3600, previous: 3000, change: 600, changePct: 20, direction: 'up', isNew: false }] },
      budgetsStatuses: [
        { budgetId: 'b1', category: 'Food', budgetAmount: 3000, spent: 3600, remaining: -600, utilizationPct: 120, daysElapsed: 18, daysRemaining: 14, daysInMonth: 31, projected: 6200, projectedOverrun: 3200, status: 'RED', statusReason: 'exceeded' },
      ],
      micro: { available: true, threshold: 200, count: 12, total: 1200, shareOfExpenses: 10, averageValue: 100, dominantCategory: { category: 'Food', share: 60 }, breakdown: [], monthExpenseCount: 30 },
      recurring: { committed: [{ name: 'Netflix', amount: 649, frequency: 'monthly', monthlyCost: 649, occurrenceCount: 4, medianGapDays: 30 }], monthlyRecurringCost: 649, annualRecurringCost: 7788 },
      patterns: { available: true, weekendVsWeekday: { available: true, weekendAvg: 800, weekdayAvg: 500, weekendDays: 10, weekdayDays: 20, differencePct: 60 } },
      velocity: { expenses: 12000, daysElapsed: 18, daysRemaining: 14, dailyRate: 667, projectedAdditional: 9338, projectedTotal: 21338, budget: 3000, potentialOverrun: 18338, onPaceForOverrun: true },
      safeToSpend: { available: 500, remainingDays: 14, perDay: 36, basis: 'remaining category budgets', formula: 'x' },
      profile: { targetSavingsRate: 20 },
    });

    expect(drafts.length).toBeGreaterThan(0);
    for (const d of drafts) {
      expect(d.dedupeKey).toBeTruthy();
      expect(d.explanation.formula).toBeTruthy();
      expect(d.explanation.calculation).toBeTruthy();
      expect(d.explanation.dataUsed.length).toBeGreaterThan(0);
      expect(typeof d.message).toBe('string');
    }
    const titles = drafts.map((d) => d.title);
    expect(titles).toContain('Food budget exceeded');
  });

  it('emits the honest no-data insight when the month has zero transactions', () => {
    const drafts = engine.generateInsights({
      now: noonOn('2026-10-18'),
      currentSummary: { income: 0, expenses: 0, savings: 0, savingsRate: null, categories: [], transactionCount: 0 },
      previousSummary: null,
      trends: { available: false, categories: [] },
      budgetsStatuses: [],
      micro: { available: false, threshold: 200, count: 0, total: 0 },
      recurring: { committed: [], monthlyRecurringCost: 0, annualRecurringCost: 0 },
      patterns: null,
      velocity: null,
      safeToSpend: null,
      profile: {},
    });
    expect(drafts.some((d) => d.dedupeKey.includes('no-data'))).toBe(true);
  });
});

describe('computeSafeToSpend', () => {
  it('derives per-day estimate from remaining category budgets', () => {
    const start = parseDay('2026-10-01');
    const end = parseDay('2026-11-01');
    const transactions = [tx(2000, 'expense', 'Food', '2026-10-10')];
    const s = engine.computeSafeToSpend({
      transactions,
      budgets: [{ category: 'Food', amount: 5000, month: '2026-10' }],
      recurringMonthlyCost: 0,
      profile: { monthlyIncome: 30000 },
      now: noonOn('2026-10-18'),
    });
    expect(s.available).toBe(3000);
    expect(s.perDay).toBeCloseTo(3000 / 14, 0);
    expect(s.limitation).toMatch(/does not account for unexpected/);
  });
});
