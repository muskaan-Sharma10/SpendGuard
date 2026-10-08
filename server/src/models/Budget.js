'use strict';

const mongoose = require('mongoose');
const { CATEGORIES } = require('../config/constants');

const budgetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: {
      type: String,
      enum: CATEGORIES,
      required: [true, 'Budget category is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Budget amount is required'],
      min: [0.01, 'Budget amount must be greater than zero'],
    },
    /** Month key in `YYYY-MM` form. Budgets are defined per calendar month. */
    month: {
      type: String,
      required: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format'],
    },
    note: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { timestamps: true }
);

/**
 * A user can hold at most one budget per category per month — enforced at the
 * database level so concurrent requests cannot create duplicates.
 */
budgetSchema.index({ userId: 1, category: 1, month: 1 }, { unique: true });

budgetSchema.methods.toPublicJSON = function toPublicJSON() {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Budget', budgetSchema);
