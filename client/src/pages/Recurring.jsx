import { useCallback, useEffect, useState } from 'react'
import { getData, postData, putData, deleteData } from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatMoney, formatDate } from '../utils/format'

const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Shopping', 'Entertainment', 'Education', 'Bills', 'Healthcare', 'Subscriptions', 'Travel', 'Personal Care', 'Other']
const PAYMENT_METHODS = ['UPI', 'Cash', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other']
const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly']

function RecurringModal({ initial, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(initial)
  const [form, setForm] = useState(
    initial
      ? {
          name: initial.name,
          amount: initial.amount,
          frequency: initial.frequency,
          category: initial.category || 'Subscriptions',
          paymentMethod: initial.paymentMethod || 'Bank Transfer',
          nextExpectedDate: initial.nextExpectedDate?.slice(0, 10) || '',
        }
      : { name: '', amount: '', frequency: 'monthly', category: 'Subscriptions', paymentMethod: 'Bank Transfer', nextExpectedDate: '' }
  )
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        nextExpectedDate: form.nextExpectedDate || undefined,
      }
      if (editing) {
        await putData(`/recurring/${initial.id}`, payload)
        toast.success('Recurring expense updated')
      } else {
        await postData('/recurring', payload)
        toast.success('Recurring expense added')
      }
      onSaved()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-white">{editing ? 'Edit recurring expense' : 'Add recurring expense'}</h3>
        <div>
          <label className="label">Name</label>
          <input required maxLength={80} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount</label>
            <input type="number" min="0.01" step="0.01" required className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Frequency</label>
            <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Payment method</label>
            <select className="input" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {PAYMENT_METHODS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Next expected date (optional)</label>
          <input type="date" className="input" value={form.nextExpectedDate} onChange={(e) => setForm({ ...form, nextExpectedDate: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

export default function Recurring() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [modal, setModal] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await getData('/recurring'))
    } catch (err) {
      toast.error(err.message)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
  }, [load])

  async function runDetection() {
    setDetecting(true)
    try {
      const result = await getData('/recurring/detect')
      setDetectResult(result)
      await load()
      toast.success(`Detection complete — ${result.detectedCount ?? 0} potential commitments found`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDetecting(false)
    }
  }

  async function handleDelete() {
    try {
      await deleteData(`/recurring/${confirmDelete.id}`)
      toast.success('Recurring expense removed')
      setConfirmDelete(null)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (!data) return <p className="text-slate-500">Loading recurring expenses…</p>

  const fmt = (v) => formatMoney(v, 'INR')

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Recurring expenses</h1>
          <p className="text-sm text-slate-500">
            Confirmed commitments feed budget projections; detected ones are suggestions you confirm.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={runDetection} disabled={detecting}>
            {detecting ? 'Detecting…' : '🔍 Run detection'}
          </button>
          <button className="btn-primary" onClick={() => setModal('new')}>+ Add</button>
        </div>
      </header>

      {/* Totals */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Monthly commitment</p>
          <p className="text-2xl font-semibold text-amber-300 mt-1">{fmt(data.totals.monthlyTotal)}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Annualised</p>
          <p className="text-2xl font-semibold mt-1">{fmt(data.totals.annualTotal)}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active commitments</p>
          <p className="text-2xl font-semibold mt-1">{data.totals.activeCount}</p>
        </div>
      </section>

      {detectResult?.newlyDetected?.length > 0 && (
        <div className="card border-sky-900">
          <h3 className="font-semibold text-white">Detected candidates</h3>
          <p className="text-xs text-slate-500 mt-1">
            Found from repeating amounts + merchants in your transaction history. Confirm them to
            include them in budget projections.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {detectResult.newlyDetected.map((d) => (
              <li key={d.id || d.name} className="flex justify-between text-slate-300">
                <span>{d.name} <span className="text-slate-500 text-xs">({d.frequency})</span></span>
                <span>{fmt(d.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Items table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-edge">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Frequency</th>
                <th className="px-4 py-3 hidden md:table-cell">Category</th>
                <th className="px-4 py-3 hidden md:table-cell">Next expected</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No recurring expenses yet — add one or run detection.
                </td></tr>
              ) : (
                data.items.map((r) => (
                  <tr key={r.id} className="border-b border-edge/60 hover:bg-slate-900/50">
                    <td className="px-4 py-3 text-slate-200">{r.name}</td>
                    <td className="px-4 py-3 font-medium">{fmt(r.amount)}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{r.frequency}</td>
                    <td className="px-4 py-3 hidden md:table-cell"><span className="badge bg-slate-800 text-slate-300">{r.category || '—'}</span></td>
                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{r.nextExpectedDate ? formatDate(r.nextExpectedDate) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${r.source === 'detected' ? 'bg-sky-500/15 text-sky-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                        {r.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button className="text-slate-400 hover:text-emerald-400 text-xs mr-3" onClick={() => setModal(r)}>Edit</button>
                      <button className="text-slate-400 hover:text-red-400 text-xs" onClick={() => setConfirmDelete(r)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-600">{data.note}</p>

      {modal && (
        <RecurringModal
          initial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-white">Remove “{confirmDelete.name}”?</h3>
            <p className="text-sm text-slate-400 mt-2">{fmt(confirmDelete.amount)} · {confirmDelete.frequency}</p>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
