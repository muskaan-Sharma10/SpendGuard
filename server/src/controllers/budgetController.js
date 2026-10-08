'use strict';

const budgetService = require('../services/budgetService');
const asyncHandler = require('../utils/asyncHandler');
const { validateBudget } = require('../middleware/validate');
const { monthKey } = require('../utils/dateUtils');

/**
 * Listing returns budgets enriched with spent/remaining/projected/status from
 * the SpendingIntelligenceEngine, so the client never has to recompute them.
 */
const list = asyncHandler(async (req, res) => {
  const result = await budgetService.getBudgetsWithStatus(req.user.id, {
    month: req.query.month,
    profile: req.user.doc.profile,
  });
  res.json({ success: true, data: result });
});

const create = asyncHandler(async (req, res) => {
  const clean = validateBudget(req.body);
  const month = clean.month || monthKey(new Date());
  const budget = await budgetService.createBudget(req.user.id, { ...clean, month });
  res.status(201).json({ success: true, data: { budget: budget.toPublicJSON() } });
});

const update = asyncHandler(async (req, res) => {
  const clean = validateBudget(req.body, { partial: true });
  const budget = await budgetService.updateBudget(req.user.id, req.params.id, clean);
  res.json({ success: true, data: { budget: budget.toPublicJSON() } });
});

const remove = asyncHandler(async (req, res) => {
  await budgetService.deleteBudget(req.user.id, req.params.id);
  res.json({ success: true, data: { message: 'Budget deleted' } });
});

module.exports = { list, create, update, remove };
