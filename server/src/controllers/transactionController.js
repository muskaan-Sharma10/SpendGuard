'use strict';

const transactionService = require('../services/transactionService');
const asyncHandler = require('../utils/asyncHandler');
const { validateTransaction } = require('../middleware/validate');

const list = asyncHandler(async (req, res) => {
  const result = await transactionService.listTransactions(req.user.id, req.query);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const tx = await transactionService.findOwned(req.user.id, req.params.id);
  res.json({ success: true, data: { transaction: tx.toPublicJSON() } });
});

const create = asyncHandler(async (req, res) => {
  const clean = validateTransaction(req.body);
  const tx = await transactionService.createTransaction(req.user.id, clean);
  res.status(201).json({ success: true, data: { transaction: tx.toPublicJSON() } });
});

const update = asyncHandler(async (req, res) => {
  const clean = validateTransaction(req.body, { partial: true });
  const tx = await transactionService.updateTransaction(req.user.id, req.params.id, clean);
  res.json({ success: true, data: { transaction: tx.toPublicJSON() } });
});

const remove = asyncHandler(async (req, res) => {
  await transactionService.deleteTransaction(req.user.id, req.params.id);
  res.json({ success: true, data: { message: 'Transaction deleted' } });
});

module.exports = { list, getOne, create, update, remove };
