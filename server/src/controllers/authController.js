'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const { validateRegistration, validateLogin, validateProfileUpdate } = require('../middleware/validate');

/** Sign a JWT whose subject is the user id. */
function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

const register = asyncHandler(async (req, res) => {
  const data = validateRegistration(req.body);

  const existing = await User.findOne({ email: data.email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await User.hashPassword(data.password);
  const user = await User.create({
    name: data.name,
    email: data.email,
    passwordHash,
    profile: {
      currency: req.body.profile?.currency || 'INR',
      monthlyIncome: Number(req.body.profile?.monthlyIncome) || 0,
      monthlySavingsTarget: Number(req.body.profile?.monthlySavingsTarget) || 0,
      targetSavingsRate: Number.isFinite(Number(req.body.profile?.targetSavingsRate))
        ? Number(req.body.profile.targetSavingsRate)
        : 20,
    },
  });

  res.status(201).json({ success: true, data: { user: user.toPublicJSON(), token: signToken(user) } });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = validateLogin(req.body);

  // `+passwordHash` because the field is `select: false` by default.
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  // Identical error for unknown email and wrong password — no account enumeration.
  const invalid = ApiError.unauthorized('Invalid email or password');
  if (!user) throw invalid;
  const ok = await user.verifyPassword(password);
  if (!ok) throw invalid;

  res.json({ success: true, data: { user: user.toPublicJSON(), token: signToken(user) } });
});

/**
 * Stateless JWT logout: the client discards the token. The endpoint exists so
 * the flow is explicit and so a future token-denylist can be added here
 * without changing the client contract.
 */
const logout = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { message: 'Logged out. Discard the token on the client.' } });
});

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.doc.toPublicJSON() } });
});

const updateProfile = asyncHandler(async (req, res) => {
  const clean = validateProfileUpdate(req.body);
  const user = req.user.doc;

  if (clean.name) user.name = clean.name;
  if (clean.profile) Object.assign(user.profile, clean.profile);

  await user.save();
  res.json({ success: true, data: { user: user.toPublicJSON() } });
});

module.exports = { register, login, logout, me, updateProfile };
