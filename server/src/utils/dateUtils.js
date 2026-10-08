'use strict';

/**
 * Pure date helpers used by the analytics engine.
 *
 * Convention: all transaction dates are stored as UTC midnights created from
 * `YYYY-MM-DD` strings, so "month" and "day" arithmetic is deterministic
 * regardless of the server's timezone.
 */

/** Parse a `YYYY-MM-DD` string into a UTC-midnight Date, or normalise a Date. */
function parseDay(input) {
  if (input instanceof Date) return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  if (typeof input === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (!match) return null;
    const [, y, m, d] = match.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null; // e.g. 2026-02-31
    return date;
  }
  return null;
}

/** Format a Date as `YYYY-MM-DD` (UTC). */
function toDayString(date) {
  return date.toISOString().slice(0, 10);
}

/** Inclusive-exclusive range covering the whole UTC month of `date`. */
function monthRange(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

/** The month immediately before `date`'s month. */
function previousMonthRange(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const end = monthRange(start).end;
  return { start, end };
}

/** Whole number of days between two UTC midnights (end - start). */
function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Days elapsed in the current month as of `now` (UTC).
 * Day 1 of the month counts as elapsed once it has begun, so on the 18th the
 * answer is 18 — matching the worked examples in the product spec.
 */
function elapsedDaysInMonth(now = new Date()) {
  const { start } = monthRange(now);
  const { end: monthEnd } = monthRange(now);
  const end = now.getTime() < monthEnd.getTime() ? now : monthEnd;
  const fullDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  return Math.min(fullDays + 1, daysBetween(start, monthEnd));
}

/** Total days in the UTC month containing `date`. */
function daysInMonth(date) {
  const { start, end } = monthRange(date);
  return daysBetween(start, end);
}

/** Days remaining in the current month as of `now`, inclusive of today. */
function daysRemainingInMonth(now = new Date()) {
  return Math.max(daysInMonth(now) - elapsedDaysInMonth(now) + 1, 0);
}

/** Inclusive-exclusive range covering the last `n` days ending today. */
function lastNDaysRange(n, now = new Date()) {
  const today = parseDay(toDayString(now));
  const start = new Date(today.getTime() - (n - 1) * 86_400_000);
  const end = new Date(today.getTime() + 86_400_000);
  return { start, end };
}

/** Month key like `2026-10` for grouping. */
function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

module.exports = {
  parseDay,
  toDayString,
  monthRange,
  previousMonthRange,
  daysBetween,
  elapsedDaysInMonth,
  daysInMonth,
  daysRemainingInMonth,
  lastNDaysRange,
  monthKey,
};
