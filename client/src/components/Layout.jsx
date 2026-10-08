import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { to: '/', label: 'Dashboard', end: true, icon: '📊' },
  { to: '/transactions', label: 'Transactions', icon: '🧾' },
  { to: '/budgets', label: 'Budgets', icon: '🎯' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
  { to: '/recurring', label: 'Recurring', icon: '🔁' },
  { to: '/profile', label: 'Profile', icon: '👤' },
]

/**
 * App shell: sidebar navigation on desktop, top bar on mobile, and a footer
 * note reinforcing the transparency promise of the product.
 */
export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:w-60 md:flex-col border-r border-edge bg-card/50 px-4 py-6 sticky top-0 h-screen">
        <div className="px-2 mb-8">
          <span className="text-lg font-bold text-white tracking-tight">
            Spend<span className="text-emerald-400">Guard</span>
          </span>
          <p className="text-[11px] text-slate-500 mt-1">Transparent finance analytics</p>
        </div>
        <nav className="flex-1 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-600/15 text-emerald-300 font-medium'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`
              }
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-edge pt-4 px-2">
          <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          <button onClick={handleLogout} className="btn-secondary mt-3 w-full">
            Log out
          </button>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-edge bg-card/50 sticky top-0 z-20">
        <span className="font-bold text-white">
          Spend<span className="text-emerald-400">Guard</span>
        </span>
        <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-slate-200">
          Log out
        </button>
      </header>
      <nav className="md:hidden flex overflow-x-auto gap-1 px-2 py-2 border-b border-edge bg-card/30">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs ${
                isActive
                  ? 'bg-emerald-600/15 text-emerald-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Outlet />
        </div>
        <footer className="max-w-6xl mx-auto px-4 py-6 text-xs text-slate-600">
          SpendGuard is a decision-support tool, not a financial advisor. Every number shown is
          calculated deterministically from your own data — each card explains how.
        </footer>
      </main>
    </div>
  )
}
