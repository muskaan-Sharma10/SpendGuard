'use strict';

const mongoose = require('mongoose');
const { INSIGHT_TYPES, INSIGHT_SEVERITIES } = require('../config/constants');

const insightSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: INSIGHT_TYPES, required: true },
    title: { type: String, required: true, maxlength: 140 },
    message: { type: String, required: true, maxlength: 600 },
    severity: { type: String, enum: INSIGHT_SEVERITIES, default: 'low' },
    category: { type: String, default: 'general' },
    /** The month the insight describes, e.g. `2026-10`. */
    periodKey: { type: String, default: null },
    /** Deterministic key so the same insight is not duplicated on re-runs. */
    dedupeKey: { type: String, required: true },
    /** Concrete numbers behind the insight — shown verbatim in the UI. */
    calculatedValues: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** One-line human formula, e.g. "projected = spent / elapsed × daysInMonth". */
    formula: { type: String, default: '' },
    /** The full "Why am I seeing this?" breakdown. */
    explanation: {
      dataUsed: { type: [String], default: [] },
      formula: { type: String, default: '' },
      calculation: { type: String, default: '' },
      result: { type: String, default: '' },
      interpretation: { type: String, default: '' },
    },
    /** Neutral, decision-support style suggestion — never an instruction. */
    recommendation: { type: String, default: '', maxlength: 400 },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/** Fetching a user's insight feed, newest first. */
insightSchema.index({ userId: 1, generatedAt: -1 });
/** Upsert path: replace today's version of the same insight for the same period. */
insightSchema.index({ userId: 1, dedupeKey: 1, periodKey: 1 }, { unique: true });

insightSchema.methods.toPublicJSON = function toPublicJSON() {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Insight', insightSchema);
