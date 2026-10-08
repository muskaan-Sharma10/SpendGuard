'use strict';

const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const env = require('./config/env');
const logger = require('./utils/logger');

async function start() {
  try {
    await connectDB();
    logger.info(`MongoDB connected → ${env.mongoUri.replace(/\/\/.*@/, '//<credentials>@')}`);

    const server = app.listen(env.port, () => {
      logger.info(`SpendGuard API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
      // Force-exit if connections refuse to drain.
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error('Failed to start server', { message: err.message });
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { start };
