'use strict';

/**
 * Money helpers. Amounts are stored as Numbers in MongoDB (2-decimal capped)
 * and rounded consistently here so display values never show floating point
 * noise (e.g. 5333.333333 → 5333.33).
 */

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** Round only when the value is finite; NaN/undefined pass through as null. */
const safeRound2 = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? round2(n) : null;
};

/** Percentage rounded to 1 decimal, or null when the denominator is 0. */
const percent = (part, whole, decimals = 1) => {
  if (!whole || !Number.isFinite(whole) || !Number.isFinite(part)) return null;
  return Math.round(((part / whole) * 100 * 10 ** decimals) / 10 ** decimals);
};

/** Clamp a number into [min, max]. */
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** Sum a list of numeric fields, treating null/undefined as 0. */
const sum = (values) => values.reduce((acc, v) => acc + (Number.isFinite(Number(v)) ? Number(v) : 0), 0);

/** Standard deviation (population) of a numeric array. */
const stdDev = (values) => {
  if (values.length === 0) return 0;
  const mean = sum(values) / values.length;
  const variance = sum(values.map((v) => (v - mean) ** 2)) / values.length;
  return Math.sqrt(variance);
};

module.exports = { round2, safeRound2, percent, clamp, sum, stdDev };
