'use strict';

/**
 * Transaction service — all database access for transactions lives here so
 * controllers stay thin and every query is provably scoped to a user.
 */

const Transaction = require('../models/Transaction');
const ApiError = require('../utils/ApiError');
const { parseDay } = require('../utils/dateUtils');

const SORTABLE_FIELDS = {
  date: 'date',
  amount: 'amount',
  category: 'category',
  createdAt: 'createdAt',
};

function buildFilter(userId, query) {
  const filter = { userId };

  if (query.type && ['income', 'expense'].includes(query.type)) {
    filter.type = query.type;
  }
  if (query.category) filter.category = query.category;
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;

  // Date range filter (inclusive bounds, YYYY-MM-DD)
  const from = parseDay(query.from);
  const to = parseDay(query.to);
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) {
      const toInclusive = new Date(to.getTime() + 86_400_000 - 1);
      filter.date.$lte = toInclusive;
    }
  }

  // Month shortcut (YYYY-MM)
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(query.month))) {
    const [y, m] = query.month.split('-').map(Number);
    filter.date = {
      $gte: new Date(Date.UTC(y, m - 1, 1)),
      $lt: new Date(Date.UTC(y, m, 1)),
    };
  }

  // Simple text search across merchant, note, subcategory (escaped).
  if (query.search && typeof query.search === 'string') {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [{ merchant: rx }, { note: rx }, { subcategory: rx }, { category: rx }];
  }

  return filter;
}

/**
 * Paginated, filtered, sorted listing.
 * Query params: page, limit, sort (date|amount|category|createdAt),
 * order (asc|desc), type, category, paymentMethod, from, to, month, search.
 */
async function listTransactions(userId, query = {}) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  const sortField = SORTABLE_FIELDS[query.sort] || 'date';
  const order = query.order === 'asc' ? 1 : -1;

  const filter = buildFilter(userId, query);

  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ [sortField]: order, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  return {
    items: items.map((t) => ({ ...t, id: t._id.toString(), _id: undefined, __v: undefined })),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
}

/** Fetch a single transaction only if it belongs to the user (authorization). */
async function findOwned(userId, transactionId) {
  const tx = await Transaction.findOne({ _id: transactionId, userId });
  if (!tx) {
    // Same message whether the id is unknown or foreign — never leak existence.
    throw ApiError.notFound('Transaction not found');
  }
  return tx;
}

async function createTransaction(userId, data) {
  return Transaction.create({ ...data, userId });
}

async function updateTransaction(userId, transactionId, data) {
  const tx = await findOwned(userId, transactionId);
  Object.assign(tx, data);
  await tx.save();
  return tx;
}

async function deleteTransaction(userId, transactionId) {
  const tx = await findOwned(userId, transactionId);
  await tx.deleteOne();
  return tx;
}

module.exports = {
  listTransactions,
  findOwned,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  buildFilter,
};
