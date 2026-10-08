import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(form.email.trim(), form.password)
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">
            Spend<span className="text-emerald-400">Guard</span>
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Understand your spending behaviour — with transparent calculations, not black boxes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && (
            <p className="rounded-lg bg-red-950/60 border border-red-900 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-sm text-slate-500">
            No account?{' '}
            <Link to="/register" className="text-emerald-400 hover:underline">
              Create one
            </Link>
          </p>
        </form>

        <div className="mt-4 rounded-lg border border-edge bg-card/60 px-4 py-3 text-xs text-slate-500 text-center">
          <p className="font-medium text-slate-400">Demo account (seeded with 6 months of data)</p>
          <p className="mt-1 font-mono">demo@spendguard.app · Demo@12345</p>
          <button
            type="button"
            className="mt-2 text-emerald-400 hover:underline"
            onClick={() => setForm({ email: 'demo@spendguard.app', password: 'Demo@12345' })}
          >
            Fill demo credentials
          </button>
        </div>
      </div>
    </div>
  )
}
