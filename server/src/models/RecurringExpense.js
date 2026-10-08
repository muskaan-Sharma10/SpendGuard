'use strict';

const mongoose = require('mongoose');
const { RECURRING_FREQUENCIES, CATEGORIES, PAYMENT_METHODS } = require('../config/constants');

const recurringExpenseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
    },
    frequency: { type: String, enum: RECURRING_FREQUENCIES, required: true },
    category: { type: String, enum: CATEGORIES, default: 'Subscriptions' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'UPI' },
    merchant: { type: String, trim: true, maxlength: 80, default: '' },
    /** Next date the user expects this expense to hit. */
    nextExpectedDate: { type: Date },
    /** Whether the user confirmed it, or the engine proposed it. */
    status: {
      type: String,
      enum: ['active', 'cancelled', 'suggested'],
      default: 'active',
    },
    /** Where this record came from — engine detection or manual entry. */
    source: { type: String, enum: ['detected', 'manual'], default: 'manual' },
    /** Evidence the detection engine used (transaction ids, occurrence count). */
    evidence: {
      occurrenceCount: { type: Number, default: 0 },
      transactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }],
      detectedAt: { type: Date },
    },
  },
  { timestamps: true }
);

recurringExpenseSchema.index({ userId: 1, name: 1 }, { unique: true });

recurringExpenseSchema.methods.toPublicJSON = function toPublicJSON() {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('RecurringExpense', recurringExpenseSchema);
