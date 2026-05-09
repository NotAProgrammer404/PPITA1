import { X, FileText, Star } from 'lucide-react'
import type { HistoryEntry } from '../types'

interface Props {
  history: HistoryEntry[]
  onClose: () => void
}

export default function HistoryPanel({ history, onClose }: Props) {
  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-slate-900 border-l border-slate-800 flex flex-col z-20 shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h3 className="font-semibold text-white">Session History</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {history.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-slate-600">No conversions yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
          {history.map(entry => (
            <div key={entry.session_id} className="p-4 space-y-2">
              <div className="flex items-start gap-2">
                <div className="p-1.5 bg-slate-800 rounded-lg mt-0.5 shrink-0">
                  <FileText className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{entry.filename}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                {entry.rating && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {Array.from({ length: entry.rating }).map((_, i) => (
                      <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                )}
              </div>
              {entry.latex_preview && (
                <pre className="text-xs text-slate-500 font-mono bg-slate-800/50 rounded p-2 overflow-hidden line-clamp-2">
                  {entry.latex_preview.slice(0, 120)}…
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
