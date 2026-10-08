'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * JWT authentication middleware.
 *
 * Expects `Authorization: Bearer <token>`. Verifies the signature, loads the
 * user, and attaches `req.user = { id, doc }`. Route handlers then scope every
 * query by `req.user.id`, which is the core of user data isolation.
 */
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication token missing');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw ApiError.unauthorized('Authentication token missing');

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Session expired, please log in again');
      throw ApiError.unauthorized('Invalid authentication token');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw ApiError.unauthorized('User no longer exists');

    req.user = { id: user._id.toString(), doc: user };
    next();
  } catch (err) {
    if (!err.isOperational) logger.warn('auth middleware failure', { message: err.message });
    next(err);
  }
}

module.exports = { authenticate };
