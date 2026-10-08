import { useState } from 'react'
import { putData } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED']

export default function Profile() {
  const { user, updateUser } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({
    name: user?.name || '',
    currency: user?.profile?.currency || 'INR',
    monthlyIncome: user?.profile?.monthlyIncome || 0,
    monthlySavingsTarget: user?.profile?.monthlySavingsTarget || 0,
    targetSavingsRate: user?.profile?.targetSavingsRate ?? 20,
  })
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const data = await putData('/profile', {
        name: form.name,
        profile: {
          currency: form.currency,
          monthlyIncome: Number(form.monthlyIncome) || 0,
          monthlySavingsTarget: Number(form.monthlySavingsTarget) || 0,
          targetSavingsRate: Number(form.targetSavingsRate),
        },
      })
      updateUser(data.user)
      toast.success('Profile saved — dashboard settings now use these values')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-white">Profile</h1>
        <p className="text-sm text-slate-500">
          These settings drive the currency display, savings-rate insights and health score.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">Name</label>
          <input required maxLength={80} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Email (read-only)</label>
            <input className="input opacity-60" value={user?.email || ''} readOnly />
          </div>
          <div>
            <label className="label">Currency</label>
            <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Monthly income</label>
            <input type="number" min="0" step="0.01" className="input" value={form.monthlyIncome} onChange={(e) => setForm({ ...form, monthlyIncome: e.target.value })} />
          </div>
          <div>
            <label className="label">Monthly savings target</label>
            <input type="number" min="0" step="0.01" className="input" value={form.monthlySavingsTarget} onChange={(e) => setForm({ ...form, monthlySavingsTarget: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Target savings rate (% of income)</label>
          <input type="number" min="0" max="100" step="1" className="input" value={form.targetSavingsRate} onChange={(e) => setForm({ ...form, targetSavingsRate: e.target.value })} />
          <p className="text-xs text-slate-500 mt-1">
            Insights compare your actual savings rate against this target — the target is yours,
            never a generic benchmark.
          </p>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  )
}
