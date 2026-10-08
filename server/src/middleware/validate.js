'use strict';

/**
 * Hand-written request validators.
 *
 * A schema library (Joi/Zod/express-validator) would also work, but a small
 * explicit validator keeps the dependency surface minimal and makes every
 * validation rule directly quotable in an interview. Each validator returns
 * a cleaned object or throws ApiError.badRequest with field-level details.
 */

const ApiError = require('../utils/ApiError');
const { parseDay } = require('../utils/dateUtils');
const {
  CATEGORIES,
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
  RECURRING_FREQUENCIES,
  RISK_PREFERENCES,
  CURRENCIES,
} = require('../config/constants');

function collect(errors) {
  if (errors.length > 0) {
    throw ApiError.badRequest('Validation failed', errors);
  }
}

function requireString(value, field, errors, { max = 200, optional = false, trim = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!optional) errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (typeof value !== 'string') {
    errors.push({ field, message: `${field} must be a string` });
    return undefined;
  }
  const cleaned = trim ? value.trim() : value;
  if (cleaned.length > max) errors.push({ field, message: `${field} cannot exceed ${max} characters` });
  return cleaned;
}

function requireAmount(value, field, errors, { positiveOnly = true } = {}) {
  const num = Number(value);
  if (value === undefined || value === null || value === '') {
    errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (!Number.isFinite(num)) {
    errors.push({ field, message: `${field} must be a number` });
    return undefined;
  }
  if (positiveOnly && num <= 0) {
    errors.push({ field, message: `${field} must be greater than zero` });
    return undefined;
  }
  const rounded = Math.round(num * 100) / 100;
  if (rounded > 1_000_000_000) {
    errors.push({ field, message: `${field} is unrealistically large` });
    return undefined;
  }
  return rounded;
}

function requireEnum(value, field, errors, allowed, { optional = false, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return fallback;
    errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  if (!allowed.includes(value)) {
    errors.push({ field, message: `${field} must be one of: ${allowed.join(', ')}` });
    return undefined;
  }
  return value;
}

function requireDate(value, field, errors, { optional = false, fallback } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return fallback;
    errors.push({ field, message: `${field} is required` });
    return undefined;
  }
  const day = parseDay(value);
  if (!day) {
    errors.push({ field, message: `${field} must be a valid date in YYYY-MM-DD format` });
    return undefined;
  }
  return day;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

function validateTransaction(body, { partial = false } = {}) {
  const errors = [];
  const clean = {};

  const has = (key) => body[key] !== undefined || !partial;

  if (has('amount')) clean.amount = requireAmount(body.amount, 'amount', errors);
  if (has('type')) clean.type = requireEnum(body.type, 'type', errors, TRANSACTION_TYPES);
  if (has('category')) clean.category = requireEnum(body.category, 'category', errors, CATEGORIES);

  if (body.date !== undefined || !partial) {
    clean.date = requireDate(body.date, 'date', errors);
  }

  if (body.subcategory !== undefined) clean.subcategory = requireString(body.subcategory, 'subcategory', errors, { optional: true, max: 60 });
  if (body.merchant !== undefined) clean.merchant = requireString(body.merchant, 'merchant', errors, { optional: true, max: 80 });
  if (body.note !== undefined) clean.note = requireString(body.note, 'note', errors, { optional: true, max: 300 });
  if (body.paymentMethod !== undefined) clean.paymentMethod = requireEnum(body.paymentMethod, 'paymentMethod', errors, PAYMENT_METHODS, { optional: true });

  if (body.isRecurring !== undefined) {
    clean.isRecurring = Boolean(body.isRecurring);
    if (clean.isRecurring && body.recurringFrequency === undefined) {
      errors.push({ field: 'recurringFrequency', message: 'recurringFrequency is required when isRecurring is true' });
    }
  }
  if (body.recurringFrequency !== undefined) {
    clean.recurringFrequency = body.recurringFrequency
      ? requireEnum(body.recurringFrequency, 'recurringFrequency', errors, RECURRING_FREQUENCIES)
      : null;
  }

  collect(errors);
  return clean;
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

function validateBudget(body, { partial = false } = {}) {
  const errors = [];
  const clean = {};

  if (body.amount !== undefined || !partial) clean.amount = requireAmount(body.amount, 'amount', errors);

  if (body.category !== undefined || !partial) {
    clean.category = requireEnum(body.category, 'category', errors, CATEGORIES);
  }

  if (body.month !== undefined) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(body.month))) {
      errors.push({ field: 'month', message: 'month must be in YYYY-MM format' });
    } else {
      clean.month = body.month;
    }
  }

  if (body.note !== undefined) clean.note = requireString(body.note, 'note', errors, { optional: true, max: 200 });

  collect(errors);
  return clean;
}

// ---------------------------------------------------------------------------
// Recurring expenses
// ---------------------------------------------------------------------------

function validateRecurringExpense(body, { partial = false } = {}) {
  const errors = [];
  const clean = {};

  if (body.name !== undefined || !partial) clean.name = requireString(body.name, 'name', errors, { max: 80 });
  if (body.amount !== undefined || !partial) clean.amount = requireAmount(body.amount, 'amount', errors);
  if (body.frequency !== undefined || !partial) {
    clean.frequency = requireEnum(body.frequency, 'frequency', errors, RECURRING_FREQUENCIES);
  }
  if (body.category !== undefined) clean.category = requireEnum(body.category, 'category', errors, CATEGORIES, { optional: true, fallback: 'Subscriptions' });
  if (body.paymentMethod !== undefined) clean.paymentMethod = requireEnum(body.paymentMethod, 'paymentMethod', errors, PAYMENT_METHODS, { optional: true });
  if (body.merchant !== undefined) clean.merchant = requireString(body.merchant, 'merchant', errors, { optional: true, max: 80 });
  if (body.nextExpectedDate !== undefined) {
    clean.nextExpectedDate = body.nextExpectedDate ? requireDate(body.nextExpectedDate, 'nextExpectedDate', errors) : null;
  }
  if (body.status !== undefined) {
    clean.status = requireEnum(body.status, 'status', errors, ['active', 'cancelled', 'suggested'], { optional: true, fallback: 'active' });
  }

  collect(errors);
  return clean;
}

// ---------------------------------------------------------------------------
// Auth / profile
// ---------------------------------------------------------------------------

function validateRegistration(body) {
  const errors = [];
  const clean = {};

  clean.name = requireString(body.name, 'name', errors, { max: 80 });

  const email = requireString(body.email, 'email', errors, { max: 120 });
  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: 'email', message: 'Please provide a valid email address' });
    } else {
      clean.email = email.toLowerCase();
    }
  }

  if (typeof body.password !== 'string' || body.password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  } else if (body.password.length > 128) {
    errors.push({ field: 'password', message: 'Password cannot exceed 128 characters' });
  } else {
    clean.password = body.password;
  }

  collect(errors);
  return clean;
}

function validateLogin(body) {
  const errors = [];
  const clean = {};
  clean.email = requireString(body.email, 'email', errors, { max: 120 });
  if (!body.password || typeof body.password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  } else {
    clean.password = body.password;
  }
  collect(errors);
  return clean;
}

function validateProfileUpdate(body) {
  const errors = [];
  const clean = {};

  if (body.name !== undefined) clean.name = requireString(body.name, 'name', errors, { max: 80 });

  const profile = body.profile || {};
  const cleanProfile = {};

  if (profile.currency !== undefined) cleanProfile.currency = requireEnum(profile.currency, 'profile.currency', errors, CURRENCIES, { optional: true });
  if (profile.monthlyIncome !== undefined) cleanProfile.monthlyIncome = requireAmount(profile.monthlyIncome, 'profile.monthlyIncome', errors, { positiveOnly: false }) ?? 0;
  if (profile.monthlySavingsTarget !== undefined) cleanProfile.monthlySavingsTarget = requireAmount(profile.monthlySavingsTarget, 'profile.monthlySavingsTarget', errors, { positiveOnly: false }) ?? 0;
  if (profile.targetSavingsRate !== undefined) {
    const rate = Number(profile.targetSavingsRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      errors.push({ field: 'profile.targetSavingsRate', message: 'targetSavingsRate must be between 0 and 100' });
    } else {
      cleanProfile.targetSavingsRate = rate;
    }
  }
  if (profile.riskPreference !== undefined) cleanProfile.riskPreference = requireEnum(profile.riskPreference, 'profile.riskPreference', errors, RISK_PREFERENCES, { optional: true });
  if (profile.preferredCategories !== undefined) {
    if (!Array.isArray(profile.preferredCategories)) {
      errors.push({ field: 'profile.preferredCategories', message: 'preferredCategories must be an array' });
    } else {
      cleanProfile.preferredCategories = profile.preferredCategories.map((c) =>
        requireEnum(c, 'profile.preferredCategories', errors, CATEGORIES)
      );
    }
  }

  if (Object.keys(cleanProfile).length > 0) clean.profile = cleanProfile;
  collect(errors);
  return clean;
}

module.exports = {
  validateTransaction,
  validateBudget,
  validateRecurringExpense,
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
};
