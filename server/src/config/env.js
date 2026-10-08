'use strict';

require('dotenv').config();

/**
 * Centralised, validated environment configuration.
 * Nothing else in the codebase reads `process.env` directly — this keeps
 * secrets in one place and makes the app fail fast on misconfiguration.
 */

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const isTest = NODE_ENV === 'test';

const JWT_SECRET =
  process.env.JWT_SECRET || (isTest ? 'test-only-secret-do-not-use-in-production' : '');

if (!JWT_SECRET) {
  // Fail fast rather than silently signing tokens with an undefined secret.
  throw new Error(
    'JWT_SECRET is not set. Copy server/.env.example to server/.env and set a strong secret.'
  );
}

const env = {
  nodeEnv: NODE_ENV,
  isTest,
  isProduction: NODE_ENV === 'production',
  // A non-positive PORT is treated as "unset" — port 0 means "random free
  // port" to Node, which is never what this API should do.
  port: toInt(process.env.PORT, 5000) > 0 ? toInt(process.env.PORT, 5000) : 5000,
  // Test isolation is non-negotiable: under NODE_ENV=test the connection is
  // ALWAYS forced to the test database, even if a .env file provides MONGO_URI
  // (tests would otherwise connect to the main DB and wipe its collections).
  // Set MONGO_URI_TEST to point tests at a different server if needed.
  mongoUri: isTest
    ? process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/spendguard_test'
    : process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/spendguard',
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  analytics: {
    /** A transaction below this amount (in account currency) counts as micro-spending. */
    microSpendThreshold: toInt(process.env.MICRO_SPEND_THRESHOLD, 200),
    /** Minimum span of transaction history (days) before behavioural patterns are reported. */
    minDaysForPatterns: toInt(process.env.MIN_DAYS_FOR_PATTERNS, 14),
    /** Minimum span of history (days) before a merchant pattern may be called "recurring". */
    minDaysForRecurring: toInt(process.env.MIN_DAYS_FOR_RECURRING, 60),
  },
};

module.exports = env;
