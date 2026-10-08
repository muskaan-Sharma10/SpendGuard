import { createContext, useCallback, useContext, useState } from 'react'

/**
 * Minimal toast system — no external dependency.
 * Usage: `const toast = useToast(); toast.success('Saved'); toast.error('Nope')`
 */
const ToastContext = createContext(null)

let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind, message) => {
      const id = nextId
      nextId += 1
      setToasts((prev) => [...prev, { id, kind, message }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss]
  )

  const toast = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }

  const styles = {
    success: 'border-emerald-700 bg-emerald-950/90 text-emerald-200',
    error: 'border-red-800 bg-red-950/90 text-red-200',
    info: 'border-sky-800 bg-sky-950/90 text-sky-200',
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`text-left rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur transition-opacity ${styles[t.kind]}`}
          >
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
