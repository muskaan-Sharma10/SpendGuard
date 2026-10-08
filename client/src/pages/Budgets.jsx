import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getData, postData, putData, deleteData } from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatMoney, statusStyle, monthLabel } from '../utils/format'
import WhyDialog from '../components/WhyDialog'

const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Shopping', 'Entertainment', 'Education', 'Bills', 'Healthcare', 'Subscriptions', 'Travel', 'Personal Care', 'Other']

function BudgetModal({ initial, month, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(initial)
  const [form, setForm] = useState(
    initial
      ? { category: initial.category, amount: initial.budgetAmount ?? initial.amount, month: initial.month }
      : { category: 'Food', amount: '', month }
  )
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = { category: form.category, amount: Number(form.amount), month: form.month }
      if (editing) {
        await putData(`/budgets/${initial.budgetId || initial.id}`, payload)
        toast.success('Budget updated')
      } else {
        await postData('/budgets', payload)
        toast.success('Budget created')
      }
      onSaved()
    } catch (err) {
      toast.error(err.details?.length ? `${err.message}: ${err.details.map((d) => d.field).join(', ')}` : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm space-y-3">
        <h3 className="text-lg font-semibold text-white">{editing ? 'Edit budget' : 'New budget'}</h3>
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Monthly limit</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            className="input"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Month</label>
          <input type="month" required className="input" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

export default function Budgets() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [modal, setModal] = useState(null)
  const [why, setWhy] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await getData('/budgets'))
    } catch (err) {
      toast.error(err.message)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete() {
    try {
      await deleteData(`/budgets/${confirmDelete.budgetId}`)
      toast.success('Budget deleted')
      setConfirmDelete(null)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (!data) return <p className="text-slate-500">Loading budgets…</p>

  const fmt = (v) => formatMoney(v, 'INR')

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Budgets — {monthLabel(data.month)}</h1>
          <p className="text-sm text-slate-500">
            Projections separate fixed recurring commitments from variable spending pace.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setModal('new')}>+ New budget</button>
      </header>

      {data.items.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-slate-400">No budgets for this month yet.</p>
          <p className="text-sm text-slate-500 mt-1">
            Budgets unlock pace projections and the financial-health score.
          </p>
          <button className="btn-primary mt-4" onClick={() => setModal('new')}>Create your first budget</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.items.map((b) => {
            const style = statusStyle(b.status)
            const util = Math.min(b.utilizationPct || 0, 100)
            return (
              <div key={b.budgetId} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-white">{b.category}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {fmt(b.spent)} of {fmt(b.budgetAmount)} · {b.utilizationPct}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${style.pill}`}>{b.status}</span>
                    <button className="btn-secondary text-xs py-1" onClick={() => setWhy({
                      title: `${b.category} budget status`,
                      explanation: {
                        dataUsed: [
                          `Budget: ${fmt(b.budgetAmount)}`,
                          `Spent so far: ${fmt(b.spent)} (fixed/recurring: ${fmt(b.fixedAlreadyPaid)}, variable: ${fmt(b.variableSpent)})`,
                          `Fixed recurring commitments in this category: ${fmt(b.fixedMonthlyCommitment)}/month`,
                        ],
                        formula: b.projectionMethod,
                        calculation: `(${fmt(b.variableSpent)} / ${b.daysElapsed}) × ${b.daysInMonth} + ${fmt(b.fixedMonthlyCommitment)}`,
                        result: `Projected month-end spend: ${fmt(b.projected)} → ${b.status}`,
                        interpretation: b.statusReason,
                      },
                    })}>Why?</button>
                  </div>
                </div>

                <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${util}%` }} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500">Remaining</p>
                    <p className="text-slate-200 font-medium">{fmt(b.remaining)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Projected</p>
                    <p className="text-slate-200 font-medium">{fmt(b.projected)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Pace overrun</p>
                    <p className={b.projectedOverrun > 0 ? 'text-amber-300 font-medium' : 'text-slate-200 font-medium'}>
                      {b.projectedOverrun > 0 ? fmt(b.projectedOverrun) : '—'}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500 border-t border-edge pt-2">{b.statusReason}</p>

                <div className="flex gap-3 mt-3 text-xs">
                  <button className="text-slate-400 hover:text-emerald-400" onClick={() => setModal(b)}>Edit</button>
                  <button className="text-slate-400 hover:text-red-400" onClick={() => setConfirmDelete(b)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-slate-600">
        Fixed commitments come from your{' '}
        <Link to="/recurring" className="text-emerald-400 hover:underline">recurring expenses</Link>; only variable
        spending is extrapolated from your pace so far.
      </p>

      {modal && (
        <BudgetModal
          initial={modal === 'new' ? null : modal}
          month={data.month}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
      {why && <WhyDialog title={why.title} explanation={why.explanation} onClose={() => setWhy(null)} />}
      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-white">Delete the {confirmDelete.category} budget?</h3>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
