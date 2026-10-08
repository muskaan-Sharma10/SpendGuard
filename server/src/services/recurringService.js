'use strict';

/**
 * Recurring expense service.
 *
 * Detection is engine-side (pure function over transactions); this service
 * persists the confirmed candidates as `suggested` RecurringExpense records
 * the user can promote to `active` or dismiss, and computes commitment totals.
 */

const RecurringExpense = require('../models/RecurringExpense');
const Transaction = require('../models/Transaction');
const engine = require('../analytics/SpendingIntelligenceEngine');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');

async function listRecurring(userId) {
  return RecurringExpense.find({ userId }).sort({ createdAt: -1 });
}

/** Monthly + annual commitment totals across active and suggested records. */
function computeTotals(records) {
  const counted = records.filter((r) => r.status === 'active' || r.status === 'suggested');
  const monthly = counted.reduce((acc, r) => {
    const monthsPerCycle = { weekly: 52 / 12, monthly: 1, quarterly: 3, yearly: 12 }[r.frequency] || 1;
    return acc + r.amount / monthsPerCycle;
  }, 0);
  const monthlyCost = Math.round(monthly * 100) / 100;
  return {
    monthlyTotal: monthlyCost,
    annualTotal: Math.round(monthlyCost * 12 * 100) / 100,
    activeCount: counted.length,
  };
}

async function createRecurring(userId, data) {
  const existing = await RecurringExpense.findOne({ userId, name: data.name });
  if (existing) throw ApiError.conflict(`A recurring expense named "${data.name}" already exists`);
  return RecurringExpense.create({ ...data, userId, source: data.source || 'manual' });
}

async function findOwned(userId, id) {
  const record = await RecurringExpense.findOne({ _id: id, userId });
  if (!record) throw ApiError.notFound('Recurring expense not found');
  return record;
}

async function updateRecurring(userId, id, data) {
  const record = await findOwned(userId, id);
  Object.assign(record, data);
  await record.save();
  return record;
}

async function deleteRecurring(userId, id) {
  const record = await findOwned(userId, id);
  await record.deleteOne();
  return record;
}

/**
 * Run engine detection over the user's history and persist any newly found
 * medium/high-confidence candidates (they never overwrite user edits).
 */
async function runDetection(userId, { now = new Date() } = {}) {
  const transactions = await Transaction.find({ userId, type: 'expense' }).lean();
  const result = engine.detectRecurringExpenses({
    transactions,
    minDaysForRecurring: env.analytics.minDaysForRecurring,
    now,
  });

  const existing = await RecurringExpense.find({ userId }).lean();
  const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));

  const created = [];
  for (const candidate of result.committed) {
    if (existingNames.has(candidate.name.toLowerCase())) continue;
    created.push(
      RecurringExpense.create({
        userId,
        name: candidate.name,
        amount: candidate.amount,
        frequency: candidate.frequency,
        category: candidate.category,
        paymentMethod: candidate.paymentMethod,
        merchant: candidate.merchant,
        nextExpectedDate: candidate.nextExpectedDate ? new Date(candidate.nextExpectedDate) : null,
        status: 'suggested',
        source: 'detected',
        evidence: {
          occurrenceCount: candidate.occurrenceCount,
          transactionIds: candidate.transactionIds,
          detectedAt: new Date(),
        },
      })
    );
  }
  await Promise.all(created);

  return {
    detection: {
      available: result.available,
      hasSufficientHistory: result.hasSufficientHistory,
      insufficientHistoryMessage: result.insufficientHistoryMessage,
      monthlyRecurringCost: result.monthlyRecurringCost,
      annualRecurringCost: result.annualRecurringCost,
      newSuggestions: created.length,
    },
  };
}

module.exports = {
  listRecurring,
  computeTotals,
  createRecurring,
  findOwned,
  updateRecurring,
  deleteRecurring,
  runDetection,
};
