import { useCallback, useEffect, useMemo, useState } from 'react'
import { getData, postData, putData, deleteData } from '../api/client'
import { useToast } from '../context/ToastContext'
import { formatDate, formatMoney } from '../utils/format'

const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Shopping', 'Entertainment', 'Education', 'Bills', 'Healthcare', 'Subscriptions', 'Travel', 'Personal Care', 'Other']
const PAYMENT_METHODS = ['UPI', 'Cash', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Other']

const EMPTY_FORM = {
  amount: '',
  type: 'expense',
  category: 'Food',
  date: new Date().toISOString().slice(0, 10),
  merchant: '',
  subcategory: '',
  paymentMethod: 'UPI',
  note: '',
}

function TransactionModal({ initial, onClose, onSaved }) {
  const toast = useToast()
  const editing = Boolean(initial?.id)
  const [form, setForm] = useState(
    initial
      ? {
          amount: initial.amount,
          type: initial.type,
          category: initial.category,
          date: initial.date?.slice(0, 10) || EMPTY_FORM.date,
          merchant: initial.merchant || '',
          subcategory: initial.subcategory || '',
          paymentMethod: initial.paymentMethod || 'UPI',
          note: initial.note || '',
        }
      : EMPTY_FORM
  )
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        merchant: form.merchant || undefined,
        subcategory: form.subcategory || undefined,
        note: form.note || undefined,
      }
      if (editing) {
        await putData(`/transactions/${initial.id}`, payload)
        toast.success('Transaction updated')
      } else {
        await postData('/transactions', payload)
        toast.success('Transaction added')
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
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-lg font-semibold text-white">
          {editing ? 'Edit transaction' : 'Add transaction'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              className="input"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
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
            <label className="label">Date</label>
            <input
              type="date"
              required
              className="input"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Merchant (optional)</label>
            <input
              className="input"
              maxLength={80}
              value={form.merchant}
              onChange={(e) => setForm({ ...form, merchant: e.target.value })}
            />
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
          <label className="label">Note (optional)</label>
          <input
            className="input"
            maxLength={300}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Transactions() {
  const toast = useToast()
  const [result, setResult] = useState({ items: [], pagination: null })
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [month, setMonth] = useState('')
  const [sort, setSort] = useState('date')
  const [order, setOrder] = useState('desc')
  const [page, setPage] = useState(1)

  const [modal, setModal] = useState(null) // null | 'new' | transaction
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Debounce the free-text search so typing does not fire a request per keypress.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: '15', sort, order })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (type) params.set('type', type)
    if (category) params.set('category', category)
    if (paymentMethod) params.set('paymentMethod', paymentMethod)
    if (month) params.set('month', month)
    return params.toString()
  }, [page, sort, order, debouncedSearch, type, category, paymentMethod, month])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getData(`/transactions?${query}`)
      setResult(data)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
  }, [load])

  function resetToFirstPage() {
    setPage(1)
  }

  async function handleDelete() {
    try {
      await deleteData(`/transactions/${confirmDelete.id}`)
      toast.success('Transaction deleted')
      setConfirmDelete(null)
      load()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const { items, pagination } = result
  const currency = 'INR' // falls back to profile currency via formatMoney default

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Transactions</h1>
        <button className="btn-primary" onClick={() => setModal('new')}>
          + Add transaction
        </button>
      </header>

      {/* Filters ------------------------------------------------------- */}
      <div className="card grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="col-span-2">
          <label className="label">Search (merchant / note)</label>
          <input
            className="input"
            placeholder="e.g. coffee"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetToFirstPage()
            }}
          />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={type} onChange={(e) => { setType(e.target.value); resetToFirstPage() }}>
            <option value="">All</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={category} onChange={(e) => { setCategory(e.target.value); resetToFirstPage() }}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Month</label>
          <input
            type="month"
            className="input"
            value={month}
            onChange={(e) => { setMonth(e.target.value); resetToFirstPage() }}
          />
        </div>
        <div>
          <label className="label">Sort by</label>
          <select className="input" value={`${sort}:${order}`} onChange={(e) => {
            const [s, o] = e.target.value.split(':')
            setSort(s)
            setOrder(o)
          }}>
            <option value="date:desc">Date ↓</option>
            <option value="date:asc">Date ↑</option>
            <option value="amount:desc">Amount ↓</option>
            <option value="amount:asc">Amount ↑</option>
          </select>
        </div>
      </div>

      {/* Table ---------------------------------------------------------- */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-edge">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 hidden md:table-cell">Payment</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No transactions match these filters.
                </td></tr>
              ) : (
                items.map((t) => (
                  <tr key={t.id} className="border-b border-edge/60 hover:bg-slate-900/50">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-200">{t.merchant || '—'}</p>
                      {t.note && <p className="text-xs text-slate-500 truncate max-w-[220px]">{t.note}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge bg-slate-800 text-slate-300">{t.category}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{t.paymentMethod || '—'}</td>
                    <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${t.type === 'income' ? 'text-emerald-400' : 'text-red-300'}`}>
                      {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, t.currency || currency)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button className="text-slate-400 hover:text-emerald-400 text-xs mr-3" onClick={() => setModal(t)}>Edit</button>
                      <button className="text-slate-400 hover:text-red-400 text-xs" onClick={() => setConfirmDelete(t)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination ---------------------------------------------------- */}
        {pagination && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-edge text-xs text-slate-500">
            <span>
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} transactions
            </span>
            <div className="flex gap-2">
              <button className="btn-secondary py-1 px-3" disabled={pagination.page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button className="btn-secondary py-1 px-3" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <TransactionModal
          initial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            load()
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="card max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-white">Delete this transaction?</h3>
            <p className="text-sm text-slate-400 mt-2">
              {formatMoney(confirmDelete.amount)} · {confirmDelete.category} · {formatDate(confirmDelete.date)}
            </p>
            <p className="text-xs text-slate-500 mt-2">This cannot be undone.</p>
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
