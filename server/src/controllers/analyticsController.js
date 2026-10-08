'use strict';

const analyticsService = require('../services/analyticsService');
const asyncHandler = require('../utils/asyncHandler');

/**
 * All analytics endpoints read `?now=YYYY-MM-DD` optionally, which makes the
 * calculations testable and reproducible (the engine never depends on a hidden
 * clock). In normal use the client omits it and the server uses the real date.
 */
const resolveNow = (req) => {
  if (req.query.now && /^\d{4}-\d{2}-\d{2}$/.test(req.query.now)) {
    return new Date(`${req.query.now}T12:00:00.000Z`);
  }
  return new Date();
};

const overview = asyncHandler(async (req, res) => {
  const data = await analyticsService.getOverview(req.user.id, {
    now: resolveNow(req),
    profile: req.user.doc.profile,
  });
  res.json({ success: true, data });
});

const trends = asyncHandler(async (req, res) => {
  const data = await analyticsService.getTrends(req.user.id, {
    now: resolveNow(req),
    profile: req.user.doc.profile,
  });
  res.json({ success: true, data });
});

const categories = asyncHandler(async (req, res) => {
  const data = await analyticsService.getCategories(req.user.id, { now: resolveNow(req) });
  res.json({ success: true, data });
});

const insights = asyncHandler(async (req, res) => {
  const data = await analyticsService.getInsights(req.user.id, {
    now: resolveNow(req),
    profile: req.user.doc.profile,
  });
  res.json({
    success: true,
    data: {
      insights: data,
      disclaimer:
        'Insights are computed deterministically from your own transaction data. Each one shows the data, formula and calculation behind it. SpendGuard is a decision-support tool, not a financial advisor.',
    },
  });
});

const financialHealth = asyncHandler(async (req, res) => {
  const data = await analyticsService.getFinancialHealth(req.user.id, {
    now: resolveNow(req),
    profile: req.user.doc.profile,
  });
  res.json({ success: true, data });
});

module.exports = { overview, trends, categories, insights, financialHealth };
