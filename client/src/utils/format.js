/** Currency + date formatting helpers (locale-aware, currency from profile). */

const CURRENCY_LOCALE = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  AUD: 'en-AU',
  CAD: 'en-CA',
  SGD: 'en-SG',
  AED: 'en-AE',
}

export function formatMoney(amount, currency = 'INR', { compact = false } = {}) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—'
  // No `compact` notation: en-IN renders thousands as "42T" (thousand), which
  // users misread. Standard notation with 0 decimals is always unambiguous.
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] || 'en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(amount)
}

export function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function monthLabel(monthKey) {
  // "2026-10" → "Oct 2026"
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function currentMonthKey() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Status → tailwind classes for budget status pills and progress bars. */
export const STATUS_STYLES = {
  GREEN: { pill: 'bg-emerald-500/15 text-emerald-400', bar: 'bg-emerald-500' },
  AMBER: { pill: 'bg-amber-500/15 text-amber-400', bar: 'bg-amber-500' },
  RED: { pill: 'bg-red-500/15 text-red-400', bar: 'bg-red-500' },
}

export function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.GREEN
}
