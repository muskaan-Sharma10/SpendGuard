import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getData } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { formatMoney, monthLabel } from '../utils/format'
import WhyDialog from '../components/WhyDialog'

export default function Analytics() {
  const { user } = useAuth()
  const currency = user?.profile?.currency || 'INR'
  const fmt = (v, opts) => formatMoney(v, currency, opts)

  const [trends, setTrends] = useState(null)
  const [error, setError] = useState('')
  const [why, setWhy] = useState(null)

  useEffect(() => {
    let cancelled = false
    getData('/analytics/trends')
      .then((d) => !cancelled && setTrends(d))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <div className="card text-red-300">Could not load analytics: {error}</div>
  }
  if (!trends) return <p className="text-slate-500">Loading analytics…</p>

  const history = trends.monthlyHistory.map((h) => ({ ...h, label: monthLabel(h.month) }))
  const t = trends.trends || {}
  const categoryChanges = (t.categories || []).slice(0, 10).map((c) => ({
    ...c,
    short: c.category.length > 12 ? `${c.category.slice(0, 11)}…` : c.category,
  }))
  const patterns = trends.patterns || {}

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-white">Analytics</h1>
        <p className="text-sm text-slate-500">
          Like-for-like comparisons only — this month is compared against the <em>same span</em> of
          last month, never full-month vs partial-month.
        </p>
      </header>

      {/* Trend summary ------------------------------------------------- */}
      <section className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Month-over-month trend</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.comparisonLabel}</p>
          </div>
          <button
            className="btn-secondary text-xs"
            onClick={() =>
              setWhy({
                title: 'How this trend comparison works',
                explanation: {
                  dataUsed: [
                    `This month, days 1–${new Date().getUTCDate()}: ${fmt(t.currentWindowExpenses)}`,
                    `Same span last month: ${fmt(t.previousWindowExpenses)}`,
                  ],
                  formula: 'changePct = (current − previous) / previous × 100, per category and overall',
                  calculation: `(${fmt(t.currentWindowExpenses)} − ${fmt(t.previousWindowExpenses)}) / ${fmt(t.previousWindowExpenses)} × 100`,
                  result: t.previousWindowExpenses
                    ? `${(((t.currentWindowExpenses - t.previousWindowExpenses) / t.previousWindowExpenses) * 100).toFixed(1)}% overall`
                    : 'No spending in the comparison window last month',
                  interpretation:
                    'Comparing identical date spans prevents the fake "spending collapsed 80%" effect you get when comparing a partial month against a full one.',
                },
              })
            }
          >
            Why this comparison?
          </button>
        </div>

        {t.available ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-slate-950/60 border border-edge px-3 py-2">
              <p className="text-xs text-slate-500">This month so far</p>
              <p className="font-semibold text-slate-100">{fmt(t.currentWindowExpenses)}</p>
            </div>
            <div className="rounded-lg bg-slate-950/60 border border-edge px-3 py-2">
              <p className="text-xs text-slate-500">Same span last month</p>
              <p className="font-semibold text-slate-100">{fmt(t.previousWindowExpenses)}</p>
            </div>
            <div className="rounded-lg bg-slate-950/60 border border-edge px-3 py-2">
              <p className="text-xs text-slate-500">Change</p>
              <p
                className={`font-semibold ${
                  t.currentWindowExpenses > t.previousWindowExpenses ? 'text-red-300' : 'text-emerald-300'
                }`}
              >
                {t.previousWindowExpenses
                  ? `${t.currentWindowExpenses >= t.previousWindowExpenses ? '+' : ''}${(((t.currentWindowExpenses - t.previousWindowExpenses) / t.previousWindowExpenses) * 100).toFixed(1)}%`
                  : 'new spending'}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t.reason || 'Not enough history for a comparison yet.'}</p>
        )}
      </section>

      {/* Category changes ---------------------------------------------- */}
      {categoryChanges.length > 0 && (
        <section className="card">
          <h2 className="font-semibold text-white mb-4">Category changes ({t.comparisonLabel})</h2>
          <div className="space-y-2">
            {categoryChanges.map((c) => (
              <div key={c.category} className="flex items-center justify-between gap-3 text-sm border-b border-edge/60 pb-2 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-slate-200 truncate">{c.category}</span>
                  {c.isNew && <span className="badge bg-sky-500/15 text-sky-400">new this month</span>}
                </div>
                <div className="flex items-center gap-4 whitespace-nowrap">
                  <span className="text-slate-400 text-xs">
                    {fmt(c.current)} <span className="text-slate-600">vs</span> {fmt(c.previous)}
                  </span>
                  <span
                    className={`font-medium w-16 text-right ${
                      c.direction === 'up' ? 'text-red-300' : c.direction === 'down' ? 'text-emerald-300' : 'text-slate-500'
                    }`}
                  >
                    {c.changePct === null ? '—' : `${c.changePct > 0 ? '+' : ''}${c.changePct}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History chart --------------------------------------------------- */}
      <section className="card">
        <h2 className="font-semibold text-white mb-4">Savings rate over 6 months</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={history}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={40} unit="%" />
            <Tooltip formatter={(v) => `${v}%`} />
            <Line dataKey="savingsRate" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Savings rate" />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Behaviour patterns ---------------------------------------------- */}
      <section className="card">
        <h2 className="font-semibold text-white">Spending behaviour patterns</h2>
        {patterns.available ? (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {patterns.weekendVsWeekday && (
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-300">Weekend vs weekday</h3>
                  <button className="text-xs text-emerald-400 hover:underline" onClick={() => setWhy({
                    title: 'Weekend vs weekday pattern',
                    explanation: {
                      dataUsed: patterns.weekendVsWeekday.formula
                        ? [`${patterns.weekendVsWeekday.weekendDays} weekend days`, `${patterns.weekendVsWeekday.weekdayDays} weekday days`]
                        : [],
                      formula: patterns.weekendVsWeekday.formula,
                      calculation: `((${fmt(patterns.weekendVsWeekday.weekendAvg)} − ${fmt(patterns.weekendVsWeekday.weekdayAvg)}) / ${fmt(patterns.weekendVsWeekday.weekdayAvg)}) × 100`,
                      result: `${patterns.weekendVsWeekday.differencePct}% difference`,
                      interpretation:
                        'A consistently higher weekend average suggests habitual weekend spending worth reviewing.',
                    },
                  })}>Why?</button>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={[
                    { name: 'Weekday avg', value: patterns.weekendVsWeekday.weekdayAvg },
                    { name: 'Weekend avg', value: patterns.weekendVsWeekday.weekendAvg },
                  ]}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => fmt(v, { compact: true })} width={60} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {patterns.dayOfWeek?.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-300 mb-3">Average daily spend by weekday</h3>
                <div className="space-y-1.5">
                  {[...patterns.dayOfWeek]
                    .sort((a, b) => b.avgDaily - a.avgDaily)
                    .slice(0, 4)
                    .map((d) => (
                      <div key={d.day} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">{d.day}</span>
                        <span className="text-slate-200">{fmt(d.avgDaily)} / day · {d.daysObserved} days observed</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {patterns.monthPhase && (
              <div className="text-sm text-slate-400">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Month phase</h3>
                {patterns.monthPhase.message || JSON.stringify(patterns.monthPhase)}
              </div>
            )}

            {patterns.concentration && (
              <div className="text-sm text-slate-400">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Concentration</h3>
                {patterns.concentration.message ||
                  `Top category holds ${patterns.concentration.topShare}% of spending.`}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            {patterns.reason || 'Patterns appear after about two weeks of logged expenses.'}
          </p>
        )}
      </section>

      {why && <WhyDialog title={why.title} explanation={why.explanation} onClose={() => setWhy(null)} />}
    </div>
  )
}
