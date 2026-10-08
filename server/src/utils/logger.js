'use strict';

/**
 * Minimal structured logger. In production this would be swapped for pino or
 * Winston; the interface stays the same. Never log request bodies or tokens —
 * only method, path and status codes.
 */

const env = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[env.isTest ? 'error' : env.nodeEnv === 'production' ? 'info' : 'debug'];

function log(level, message, meta) {
  if (LEVELS[level] > threshold) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line, meta ?? '');
  else if (level === 'warn') console.warn(line, meta ?? '');
  else console.log(line, meta ?? '');
}

module.exports = {
  error: (message, meta) => log('error', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  info: (message, meta) => log('info', message, meta),
  debug: (message, meta) => log('debug', message, meta),
};
