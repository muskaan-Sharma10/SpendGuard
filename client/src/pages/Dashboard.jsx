import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getData } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { formatMoney, monthLabel } from '../utils/format'
import WhyDialog from '../components/WhyDialog'
import InsightCard from '../components/InsightCard'

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

function Stat({ label, value, sub, tone = 'text-white' }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const currency = user?.profile?.currency || 'INR'
  const [data, setData] = useState(null)
  const [insights, setInsights] = useState([])
  const [disclaimer, setDisclaimer] = useState('')
  const [error, setError] = useState('')
  const [why, setWhy] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getData('/analytics/overview'), getData('/analytics/insights')])
      .then(([overview, ins]) => {
        if (cancelled) return
        setData(overview)
        setInsights(ins.insights || [])
        setDisclaimer(ins.disclaimer || '')
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="card border-red-900">
        <p className="text-red-300">Could not load your dashboard: {error}</p>
        <button className="btn-secondary mt-3" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    )
  }
  if (!data) return <p className="text-slate-500">Loading your data…</p>

  const fmt = (v, opts) => formatMoney(v, currency, opts)
  const history = data.monthlyHistory.map((h) => ({
    ...h,
    label: monthLabel(h.month),
  }))
  const topCategories = [...(data.categories || [])]
    .sort((a, b) => b.expenses - a.expenses)
    .slice(0, 8)

  const health = data.health || {}

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">
            {monthLabel(data.month)} overview
          </h1>
          <p className="text-sm text-slate-500">Every number below links to its calculation.</p>
        </div>
        <Link to="/transactions" className="btn-primary">
          + Add transaction
        </Link>
      </header>

      {/* Totals ------------------------------------------------------- */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Income" value={fmt(data.totals.income, { compact: true })} />
        <Stat
          label="Expenses"
          value={fmt(data.totals.expenses, { compact: true })}
          tone="text-red-300"
          sub={`${data.totals.transactionCount} transactions`}
        />
        <Stat
          label="Savings"
          value={fmt(data.totals.savings, { compact: true })}
          tone="text-emerald-300"
        />
        <button
          className="card text-left hover:border-emerald-800 transition-colors"
          onClick={() =>
            setWhy({
              title: 'Savings rate',
              explanation: {
                dataUsed: [`Income: ${fmt(data.totals.income)}`, `Expenses: ${fmt(data.totals.expenses)}`],
                formula: 'savingsRate = (income − expenses) / income × 100',
                calculation: `(${fmt(data.totals.income)} − ${fmt(data.totals.expenses)}) / ${fmt(data.totals.income)} × 100`,
                result: `${data.totals.savingsRate}%`,
                interpretation:
                  'The share of your income left after expenses this month, compared against the target set in your profile.',
              },
            })
          }
        >
          <p className="text-xs uppercase tracking-wide text-slate-500">Savings rate</p>
          <p className="text-2xl font-semibold mt-1">{data.totals.savingsRate}%</p>
          <p className="text-xs text-emerald-400 mt-1">Why this number? →</p>
        </button>
      </section>

      {/* Safe-to-Spend + velocity ------------------------------------ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-white">Safe to spend</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {data.safeToSpend.remainingDays} days left in {monthLabel(data.month)}
              </p>
            </div>
            <button
              className="btn-secondary text-xs"
              onClick={() => setWhy({ title: 'Safe to spend', explanation: data.safeToSpend })}
            >
              How is this calculated?
            </button>
          </div>
          <div className="mt-4 flex items-baseline gap-4 flex-wrap">
            {data.safeToSpend.available >= 0 ? (
              <>
                <p className="text-3xl font-bold text-emerald-300">{fmt(data.safeToSpend.available)}</p>
                <p className="text-sm text-slate-400">
                  ≈ <span className="font-semibold text-slate-200">{fmt(data.safeToSpend.perDay)}</span> / day
                </p>
              </>
            ) : (
              <p className="text-2xl font-bold text-amber-300">
                Over planned budgets by {fmt(Math.abs(data.safeToSpend.available))}
              </p>
            )}
          </div>
          {data.safeToSpend.available < 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Spending in your budgeted categories has passed the combined limits you set. The
              figure above is what remains under your own plan — not a bank balance.
            </p>
          )}
          {data.safeToSpend.limitation && (
            <p className="mt-3 text-xs text-slate-500 italic border-t border-edge pt-3">
              Honest limitation: {data.safeToSpend.limitation}
            </p>
          )}
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-white">Spending pace</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {fmt(data.velocity.dailyRate)}/day · projected {fmt(data.velocity.projectedTotal)}
              </p>
            </div>
            <button
              className="btn-secondary text-xs"
              onClick={() => setWhy({ title: 'Spending pace projection', explanation: data.velocity })}
            >
              Why?
            </button>
          </div>
          {data.velocity.budget ? (
            <div className="mt-4">
              <p
                className={`text-sm font-medium ${
                  data.velocity.onPaceForOverrun ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {data.velocity.onPaceForOverrun
                  ? `⚠ On pace to exceed your ${fmt(data.velocity.budget)} budget by ${fmt(data.velocity.potentialOverrun)}`
                  : `✓ On pace to stay within your ${fmt(data.velocity.budget)} budget`}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Projection uses your actual daily rate this month, not a guess.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              No budgets set for this month —{' '}
              <Link to="/budgets" className="text-emerald-400 hover:underline">
                set one
              </Link>{' '}
              to unlock pace projections.
            </p>
          )}
        </div>
      </section>

      {/* Health ------------------------------------------------------- */}
      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Financial health</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Five weighted components computed from this month's data; inapplicable ones are
              excluded honestly, never guessed.
            </p>
          </div>
          <button
            className="btn-secondary text-xs"
            onClick={() =>
              setWhy({
                title: 'Financial health score',
                explanation: {
                  dataUsed: health.components?.map((c) => `${c.label}: ${c.earned}/${c.max} — ${c.detail}`) || [],
                  formula:
                    'score = Σ(component score × weight), weights renormalised when a component cannot be computed',
                  calculation:
                    health.components?.map((c) => `${c.label}: ${c.earned}/${c.max}`).join(' · ') || '—',
                  result: health.score === null ? 'Insufficient data' : `${health.score}/100`,
                  interpretation:
                    health.notes?.join(' ') ||
                    'Each component only counts when there is enough data to compute it fairly.',
                },
              })
            }
          >
            Why this score?
          </button>
        </div>

        {health.score === null ? (
          <p className="mt-4 text-sm text-amber-300">
            Not enough data yet for a fair score. {health.notes?.[0]}
          </p>
        ) : (
          <div className="mt-4 flex flex-col lg:flex-row gap-6">
            <div className="flex items-center gap-4">
              <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3.4" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke={health.score >= 70 ? '#10b981' : health.score >= 50 ? '#f59e0b' : '#ef4444'}
                    strokeWidth="3.4"
                    strokeDasharray={`${health.score} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">{health.score}</span>
                </div>
              </div>
              <div className="text-sm space-y-1">
                {health.positives?.slice(0, 3).map((p, i) => (
                  <p key={i} className="text-emerald-400">✓ {p}</p>
                ))}
                {health.attention?.slice(0, 3).map((a, i) => (
                  <p key={i} className="text-amber-400">⚠ {a}</p>
                ))}
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {health.components?.map((c) => (
                <div key={c.key} className="rounded-lg bg-slate-950/60 border border-edge px-3 py-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{c.label}</span>
                    <span className="text-slate-500">
                      {c.earned}/{c.max}
                    </span>
                  </div>
                  <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded"
                      style={{ width: `${(c.earned / c.max) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{c.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Charts ------------------------------------------------------- */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold text-white mb-4">6-month cash flow</h2>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={history}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} width={60} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Area dataKey="income" stroke="#10b981" fill="#10b981" fillOpacity={0.15} name="Income" />
              <Area dataKey="expenses" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} name="Expenses" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-semibold text-white mb-4">Spending by category</h2>
          {topCategories.length === 0 ? (
            <p className="text-sm text-slate-500">No expenses recorded this month yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topCategories} layout="vertical">
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} />
                <YAxis type="category" dataKey="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={90} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="expenses" radius={[0, 4, 4, 0]}>
                  {topCategories.map((c, i) => (
                    <Cell key={c.category} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Behaviour + leakage teasers ---------------------------------- */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold text-white">Spending behaviour</h2>
          {data.patterns?.available ? (
            <div className="mt-3 space-y-2 text-sm">
              {data.patterns.weekendVsWeekday && (
                <p className="text-slate-300">
                  Weekends run{' '}
                  <span className={data.patterns.weekendVsWeekday.differencePct > 15 ? 'text-amber-300 font-semibold' : 'font-semibold'}>
                    {data.patterns.weekendVsWeekday.differencePct > 0 ? '+' : ''}
                    {data.patterns.weekendVsWeekday.differencePct}%
                  </span>{' '}
                  vs weekdays ({fmt(data.patterns.weekendVsWeekday.weekendAvg)} vs{' '}
                  {fmt(data.patterns.weekendVsWeekday.weekdayAvg)} daily average).
                </p>
              )}
              <Link to="/analytics" className="inline-block text-emerald-400 hover:underline text-xs mt-1">
                See full behaviour analysis →
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{data.patterns?.reason || 'Keep logging transactions — patterns appear after ~2 weeks.'}</p>
          )}
        </div>

        <div className="card">
          <div className="flex items-start justify-between">
            <h2 className="font-semibold text-white">Micro-spending leakage</h2>
            <button
              className="btn-secondary text-xs"
              onClick={() =>
                setWhy({
                  title: 'Micro-spending detection',
                  explanation: {
                    dataUsed: [
                      `Small transactions (≤ ${fmt(data.microSpending.threshold)}): ${data.microSpending.count}`,
                      `Total: ${fmt(data.microSpending.total)}`,
                    ],
                    formula: 'share = totalSmallSpends / totalExpenses × 100',
                    calculation: `${fmt(data.microSpending.total)} / ${fmt(data.microSpending.totalExpenses ?? data.totals.expenses)} × 100 = ${data.microSpending.shareOfExpenses}%`,
                    result: `${data.microSpending.shareOfExpenses}% of this month's expenses`,
                    interpretation:
                      'Frequent small purchases often go unnoticed individually. This flag appears only when they add up to a meaningful share.',
                  },
                })
              }
            >
              Why?
            </button>
          </div>
          {data.microSpending?.available ? (
            <div className="mt-3 text-sm space-y-1">
              <p className="text-slate-300">
                <span className="font-semibold text-amber-300">{data.microSpending.count} transactions</span> under{' '}
                {fmt(data.microSpending.threshold)} totalled{' '}
                <span className="font-semibold">{fmt(data.microSpending.total)}</span> (
                {data.microSpending.shareOfExpenses}% of expenses).
              </p>
              {data.microSpending.dominantCategory && (
                <p className="text-slate-500 text-xs">
                  Most frequent: {data.microSpending.dominantCategory.category} (
                  {data.microSpending.dominantCategory.share}%)
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No significant small-purchase accumulation detected this month.
            </p>
          )}
        </div>
      </section>

      {/* Insights ------------------------------------------------------ */}
      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-semibold text-white">Insights</h2>
          <p className="text-sm text-slate-500">{disclaimer}</p>
        </header>
        {insights.length === 0 ? (
          <div className="card text-slate-500 text-sm">
            No insights yet — insights appear once you have enough transactions for a meaningful
            analysis. SpendGuard never invents findings.
          </div>
        ) : (
          insights.map((ins) => <InsightCard key={ins.dedupeKey} insight={ins} />)
        )}
      </section>

      {why && <WhyDialog title={why.title} explanation={why.explanation} onClose={() => setWhy(null)} />}
    </div>
  )
}
