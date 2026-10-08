import { useState } from 'react'
import WhyDialog from './WhyDialog'

const SEVERITY_STYLES = {
  high: { pill: 'bg-red-500/15 text-red-400', border: 'border-l-red-500' },
  medium: { pill: 'bg-amber-500/15 text-amber-400', border: 'border-l-amber-500' },
  low: { pill: 'bg-sky-500/15 text-sky-400', border: 'border-l-sky-500' },
}

const TYPE_LABEL = {
  warning: 'Warning',
  information: 'Info',
  positive: 'Positive',
  trend: 'Trend',
  projection: 'Projection',
  leakage: 'Leakage',
}

/** A single generated insight with its "Why" button. */
export default function InsightCard({ insight }) {
  const [showWhy, setShowWhy] = useState(false)
  const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.low

  return (
    <div className={`card border-l-4 ${style.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`badge ${style.pill}`}>
              {TYPE_LABEL[insight.type] || insight.type}
            </span>
            <span className="text-xs text-slate-500">{insight.category}</span>
          </div>
          <h3 className="font-semibold text-white">{insight.title}</h3>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">{insight.message}</p>
        </div>
        <button
          onClick={() => setShowWhy(true)}
          className="btn-secondary shrink-0 text-xs"
          title="See the exact data, formula and calculation behind this insight"
        >
          Why?
        </button>
      </div>

      {insight.recommendation && (
        <p className="mt-3 text-sm text-slate-500 border-t border-edge pt-3">
          <span className="text-slate-400 font-medium">Suggestion: </span>
          {insight.recommendation}
        </p>
      )}

      {showWhy && (
        <WhyDialog
          title={insight.title}
          explanation={insight.explanation}
          onClose={() => setShowWhy(false)}
        />
      )}
    </div>
  )
}
