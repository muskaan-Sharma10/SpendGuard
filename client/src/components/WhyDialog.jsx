import { useEffect } from 'react'

/**
 * "Why am I seeing this?" dialog — the heart of SpendGuard's transparency
 * promise. Given an `explanation` object straight from the API
 * ({ dataUsed, formula, calculation, result, interpretation }), it shows the
 * exact inputs, formula and arithmetic behind any insight or metric.
 */
export default function WhyDialog({ title, explanation, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!explanation) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-emerald-400 mb-1">
              Why am I seeing this?
            </p>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 text-sm">
          {explanation.dataUsed?.length > 0 && (
            <section>
              <h4 className="label">Data used (your own transactions)</h4>
              <ul className="space-y-1">
                {explanation.dataUsed.map((d, i) => (
                  <li key={i} className="text-slate-300 flex gap-2">
                    <span className="text-emerald-500">•</span>
                    {d}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {explanation.formula && (
            <section>
              <h4 className="label">Formula</h4>
              <code className="block rounded-lg bg-slate-950 border border-edge px-3 py-2 text-emerald-300 text-xs font-mono overflow-x-auto">
                {explanation.formula}
              </code>
            </section>
          )}

          {explanation.calculation && (
            <section>
              <h4 className="label">Calculation with your numbers</h4>
              <code className="block rounded-lg bg-slate-950 border border-edge px-3 py-2 text-sky-300 text-xs font-mono overflow-x-auto">
                {explanation.calculation}
              </code>
            </section>
          )}

          {explanation.result && (
            <section>
              <h4 className="label">Result</h4>
              <p className="text-slate-200 font-medium">{explanation.result}</p>
            </section>
          )}

          {explanation.interpretation && (
            <section className="border-t border-edge pt-3">
              <h4 className="label">What it means</h4>
              <p className="text-slate-400 leading-relaxed">{explanation.interpretation}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
