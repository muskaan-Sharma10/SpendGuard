'use strict';

const recurringService = require('../services/recurringService');
const asyncHandler = require('../utils/asyncHandler');
const { validateRecurringExpense } = require('../middleware/validate');

const list = asyncHandler(async (req, res) => {
  const records = await recurringService.listRecurring(req.user.id);
  const totals = recurringService.computeTotals(records);
  res.json({
    success: true,
    data: {
      items: records.map((r) => r.toPublicJSON()),
      totals,
      note: 'Recurring commitments are calculated from the records below. Detected items are suggestions until you confirm them.',
    },
  });
});

const detect = asyncHandler(async (req, res) => {
  const result = await recurringService.runDetection(req.user.id);
  const records = await recurringService.listRecurring(req.user.id);
  res.json({
    success: true,
    data: {
      ...result,
      items: records.map((r) => r.toPublicJSON()),
      totals: recurringService.computeTotals(records),
    },
  });
});

const create = asyncHandler(async (req, res) => {
  const clean = validateRecurringExpense(req.body);
  const record = await recurringService.createRecurring(req.user.id, clean);
  res.status(201).json({ success: true, data: { recurring: record.toPublicJSON() } });
});

const update = asyncHandler(async (req, res) => {
  const clean = validateRecurringExpense(req.body, { partial: true });
  const record = await recurringService.updateRecurring(req.user.id, req.params.id, clean);
  res.json({ success: true, data: { recurring: record.toPublicJSON() } });
});

const remove = asyncHandler(async (req, res) => {
  await recurringService.deleteRecurring(req.user.id, req.params.id);
  res.json({ success: true, data: { message: 'Recurring expense removed' } });
});

module.exports = { list, detect, create, update, remove };
