'use strict';

/**
 * Insight persistence.
 *
 * Insights are REGENERATED from live data on each analytics request (so they
 * can never go stale or drift from reality) and UPSERTED here by their
 * deterministic `dedupeKey + periodKey`, giving the user a reviewable history
 * without ever duplicating the same insight for the same month.
 */

const Insight = require('../models/Insight');

async function persistInsights(userId, drafts) {
  if (!Array.isArray(drafts) || drafts.length === 0) return;
  const ops = drafts.map((draft) => {
    const { dedupeKey, ...rest } = draft;
    return Insight.updateOne(
      { userId, dedupeKey, periodKey: rest.periodKey ?? null },
      { $set: { userId, dedupeKey, ...rest, generatedAt: new Date() } },
      { upsert: true }
    );
  });
  await Promise.all(ops);
}

async function listInsights(userId, { limit = 50 } = {}) {
  return Insight.find({ userId }).sort({ generatedAt: -1 }).limit(limit);
}

module.exports = { persistInsights, listInsights };
