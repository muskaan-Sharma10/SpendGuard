'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { CURRENCIES, RISK_PREFERENCES, CATEGORIES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by queries unless explicitly requested
    },
    profile: {
      currency: { type: String, enum: CURRENCIES, default: 'INR' },
      monthlyIncome: { type: Number, default: 0, min: 0 },
      monthlySavingsTarget: { type: Number, default: 0, min: 0 }, // absolute amount
      targetSavingsRate: { type: Number, default: 20, min: 0, max: 100 }, // percent
      riskPreference: { type: String, enum: RISK_PREFERENCES, default: 'balanced' },
      preferredCategories: { type: [String], default: ['Food', 'Transport', 'Bills'], enum: CATEGORIES },
    },
  },
  { timestamps: true }
);

/**
 * Index rationale: `email` is declared `unique: true` on the field, which
 * creates the unique index used both for the duplicate-account constraint and
 * for the login lookup that runs on every authentication request.
 */

/** Hash the password whenever it is (re)set. Plain passwords are never stored. */
userSchema.statics.hashPassword = async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** Public representation — deliberately excludes the password hash. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    profile: this.profile,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
