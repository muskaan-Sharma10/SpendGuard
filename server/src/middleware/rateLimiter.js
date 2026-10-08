'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * Limiters are disabled under NODE_ENV=test: integration tests fire hundreds
 * of legitimate requests in seconds and rate limiting would otherwise mask
 * real assertion failures with 429s. Limiters remain fully active in
 * development and production.
 */
const skipInTest = { skip: () => env.isTest };

/** General API limiter — generous, but stops runaway loops. */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest.skip,
  message: { success: false, error: { message: 'Too many requests. Please slow down.' } },
});

/** Strict limiter on credential endpoints to blunt brute-force attempts. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skip: skipInTest.skip,
  message: {
    success: false,
    error: { message: 'Too many authentication attempts. Try again in 15 minutes.' },
  },
});

module.exports = { apiLimiter, authLimiter };
