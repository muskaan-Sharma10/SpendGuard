'use strict';

const express = require('express');

const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/transactions', require('./transactionRoutes'));
router.use('/budgets', require('./budgetRoutes'));
router.use('/analytics', require('./analyticsRoutes'));
router.use('/recurring', require('./recurringRoutes'));
router.use('/profile', require('./profileRoutes'));

// Health check (unauthenticated) for uptime probes.
router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'spendguard-api' } });
});

module.exports = router;
