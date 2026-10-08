'use strict';

const mongoose = require('mongoose');
const {
  CATEGORIES,
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
  RECURRING_FREQUENCIES,
} = require('../config/constants');

const transactionSchema = new mongoose.Schema(
  {
    // No standalone index on userId: every query also filters by date,
    // category or merchant, so the compound indexes below cover the prefix.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
      validate: {
        validator: (v) => Number.isFinite(v) && Math.round(v * 100) === Math.round(Number(v.toFixed(2)) * 100),
        message: 'Amount supports at most 2 decimal places',
      },
    },
    type: { type: String, enum: TRANSACTION_TYPES, required: [true, 'Type must be income or expense'] },
    category: {
      type: String,
      enum: CATEGORIES,
      required: [true, 'Category is required'],
    },
    subcategory: { type: String, trim: true, maxlength: 60, default: '' },
    date: { type: Date, required: [true, 'A valid date is required'] },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'UPI' },
    merchant: { type: String, trim: true, maxlength: 80, default: '' },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    isRecurring: { type: Boolean, default: false },
    recurringFrequency: { type: String, enum: RECURRING_FREQUENCIES, default: null },
  },
  { timestamps: true }
);

/**
 * Indexes and why they exist:
 * - { userId, date }: every dashboard/analytics query filters by user and a
 *   date range (current month, previous month). This compound index lets
 *   MongoDB walk a single index instead of scanning the user's documents.
 * - { userId, category, type }: category breakdowns and per-budget "spent so
 *   far" lookups filter by user + category + expense type.
 * - { userId, merchant }: recurring-expense detection groups transactions by
 *   merchant for the authenticated user only.
 */
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, category: 1, type: 1 });
transactionSchema.index({ userId: 1, merchant: 1 });

transactionSchema.methods.toPublicJSON = function toPublicJSON() {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Transaction', transactionSchema);
