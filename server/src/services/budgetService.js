'use strict';

/**
 * Budget service — CRUD plus the "spent so far" aggregation that feeds the
 * SpendingIntelligenceEngine's projection/status calculations.
 */

const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const ApiError = require('../utils/ApiError');
const engine = require('../analytics/SpendingIntelligenceEngine');
const { monthRange, monthKey } = require('../utils/dateUtils');

async function listBudgets(userId, month) {
  const targetMonth = month || monthKey(new Date());
  return Budget.find({ userId, month: targetMonth }).sort({ category: 1 });
}

async function createBudget(userId, data) {
  const existing = await Budget.findOne({ userId, category: data.category, month: data.month });
  if (existing) {
    throw ApiError.conflict(`A ${data.category} budget for ${data.month} already exists`);
  }
  return Budget.create({ ...data, userId });
}

async function findOwned(userId, budgetId) {
  const budget = await Budget.findOne({ _id: budgetId, userId });
  if (!budget) throw ApiError.notFound('Budget not found');
  return budget;
}

async function updateBudget(userId, budgetId, data) {
  const budget = await findOwned(userId, budgetId);
  if (data.category && data.category !== budget.category) {
    const clash = await Budget.findOne({ userId, category: data.category, month: data.month || budget.month });
    if (clash) throw ApiError.conflict(`A ${data.category} budget for this month already exists`);
  }
  Object.assign(budget, data);
  await budget.save();
  return budget;
}

async function deleteBudget(userId, budgetId) {
  const budget = await findOwned(userId, budgetId);
  await budget.deleteOne();
  return budget;
}

const FREQUENCY_MONTHS = { weekly: 52 / 12, monthly: 1, quarterly: 3, yearly: 12 };

/** Group recurring records into per-category monthly costs (active/suggested only). */
function recurringByCategoryFrom(records) {
  const map = {};
  for (const r of records) {
    if (r.status !== 'active' && r.status !== 'suggested') continue;
    const monthsPerCycle = FREQUENCY_MONTHS[r.frequency] || 1;
    map[r.category] = (map[r.category] || 0) + r.amount / monthsPerCycle;
  }
  for (const k of Object.keys(map)) map[k] = Math.round(map[k] * 100) / 100;
  return map;
}

/**
 * Budgets of a month joined with actual spending, each enriched with the
 * engine's projection + status. Optionally capped to a custom "now" (tests).
 */
async function getBudgetsWithStatus(userId, { month, now = new Date(), profile, recurringRecords = [] } = {}) {
  const targetMonth = month || monthKey(now);
  const budgets = await Budget.find({ userId, month: targetMonth }).sort({ category: 1 });
  const { start, end } = monthRange(now);
  const recurringByCategory = recurringByCategoryFrom(recurringRecords);

  // NOTE: aggregation pipelines bypass Mongoose casting, so the userId string
  // must be converted to an ObjectId explicitly or the $match silently returns
  // nothing (which would make every budget look unspent).
  const spending = await Transaction.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), type: 'expense', date: { $gte: start, $lt: end } } },
    { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  const spentByCategory = new Map(spending.map((s) => [s._id, s.total]));

  const items = budgets.map((budget) => {
    const status = engine.computeBudgetStatus({
      budget: { ...budget.toObject(), id: budget._id.toString(), currency: profile?.currency },
      spent: spentByCategory.get(budget.category) || 0,
      recurringMonthlyForCategory: recurringByCategory.get ? recurringByCategory.get(budget.category) || 0 : recurringByCategory[budget.category] || 0,
      now,
    });
    return status;
  });

  return { month: targetMonth, items, recurringByCategory };
}

module.exports = {
  listBudgets,
  createBudget,
  findOwned,
  updateBudget,
  deleteBudget,
  getBudgetsWithStatus,
  recurringByCategoryFrom,
};
