'use strict';

const mongoose = require('mongoose');
const env = require('./env');

/**
 * Single shared Mongoose connection.
 * `connectDB` is called once from server.js (and from the test setup), so the
 * rest of the application never has to think about connection state.
 */
async function connectDB(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
  });

  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB };
