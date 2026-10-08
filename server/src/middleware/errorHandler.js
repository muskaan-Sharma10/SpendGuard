'use strict';

const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Centralised error handling. Goals:
 *  - ApiError  → its own status/message (safe, operational)
 *  - Mongoose CastError on ObjectId → 404-style "not found" (also protects
 *    against malformed/foreign document ids)
 *  - Mongoose ValidationError → 400 with field messages
 *  - Duplicate key (E11000) → 409 conflict
 *  - anything else → 500 with a generic message; details only in server logs
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for "${err.path}"`;
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {}).join(', ') || 'field';
    message = `Duplicate value for ${field}`;
  }

  if (statusCode >= 500) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    // Never leak internals to the client for unexpected errors.
    message = 'An unexpected error occurred. Please try again.';
    details = undefined;
  } else {
    logger.debug(`${statusCode} ${req.method} ${req.originalUrl} → ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: { message, ...(details ? { details } : {}) },
  });
}

function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

module.exports = { errorHandler, notFoundHandler };
