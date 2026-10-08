'use strict';

/**
 * Jest setup.
 *
 * Tests run against a REAL local MongoDB (`spendguard_test` database) rather
 * than an in-memory shim, so aggregation pipelines, unique indexes and
 * Mongoose casting behave exactly as in production.
 */

const { connectDB, disconnectDB } = require('../src/config/db');
const mongoose = require('mongoose');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

afterEach(async () => {
  // Drop all collections between tests so each test starts from a clean slate.
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});
