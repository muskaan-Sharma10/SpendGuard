'use strict';

/**
 * Domain constants shared by models, validators and the analytics engine.
 * Keeping them in one place means the API contract and the database schema
 * can never drift apart.
 */

const CATEGORIES = [
  'Food',
  'Groceries',
  'Transport',
  'Shopping',
  'Entertainment',
  'Education',
  'Bills',
  'Healthcare',
  'Subscriptions',
  'Travel',
  'Personal Care',
  'Other',
];

const PAYMENT_METHODS = ['UPI', 'Cash', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other'];

const TRANSACTION_TYPES = ['income', 'expense'];

const RECURRING_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'];

const RISK_PREFERENCES = ['conservative', 'balanced', 'aggressive'];

const INSIGHT_TYPES = [
  'warning',
  'information',
  'positive',
  'trend',
  'projection',
  'leakage',
];

const INSIGHT_SEVERITIES = ['low', 'medium', 'high'];

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'];

/** Number of days per frequency, used for annualising recurring costs. */
const FREQUENCY_MONTHS = {
  weekly: 52 / 12, // ≈ 4.333 weeks per month
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

module.exports = {
  CATEGORIES,
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
  RECURRING_FREQUENCIES,
  RISK_PREFERENCES,
  INSIGHT_TYPES,
  INSIGHT_SEVERITIES,
  CURRENCIES,
  FREQUENCY_MONTHS,
};
