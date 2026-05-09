import { useState, useEffect, useRef } from 'react'
import { Upload, FileText, Loader2, AlertCircle, Sparkles, Bot, CheckCircle2 } from 'lucide-react'
import type { AgentEvent } from '../types'

interface Props {
  onExtract: (file: File) => void
  isLoading: boolean
  error: string | null
  agentProgress: AgentEvent[]
}

function progressLabel(event: AgentEvent): { label: string; agent: 1 | 2 | null; done?: boolean } {
  switch (event.type) {
    case 'agent':
      return { label: event.message ?? '', agent: event.agent ?? null }
    case 'pass_done':
      return { label: `Found ${event.elements} elements`, agent: 1 }
    case 'critique_done':
      return {
        label: `Score ${event.score} · ${event.issues} issue${event.issues !== 1 ? 's' : ''}${event.acceptable ? ' · Acceptable ✓' : ''}`,
        agent: 2,
        done: event.acceptable,
      }
    case 'converged':
      return { label: `Converged at score ${event.score}`, agent: 2, done: true }
    default:
      return { label: '', agent: null }
  }
}

export default function UploadStep({ onExtract, isLoading, error, agentProgress }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [agentProgress])

  const handleFile = (f: File) => setFile(f)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (file) onExtract(file)
  }

  const showLog = isLoading && agentProgress.length > 0

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800 shadow-xl ring-1 ring-white/10 mb-2">
          <Sparkles className="w-7 h-7 text-indigo-400" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-white">Layout OCR</h1>
        <p className="text-slate-400 text-lg font-light">Convert images to LaTeX documents.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div
            className={`relative group border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer
              ${isDragOver
                ? 'border-indigo-500 bg-indigo-500/5'
                : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
              }`}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={e => { e.preventDefault(); setIsDragOver(false) }}
            onDrop={e => {
              e.preventDefault()
              setIsDragOver(false)
              if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
            }}
          >
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="flex flex-col items-center gap-4">
              {file ? (
                <>
                  <div className="p-3 bg-indigo-500/20 rounded-lg">
                    <FileText className="w-8 h-8 text-indigo-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-white break-all line-clamp-1">{file.name}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <span className="text-xs text-indigo-400 font-medium bg-indigo-400/10 px-3 py-1 rounded-full">
                    Change File
                  </span>
                </>
              ) : (
                <>
                  <div className={`p-3 rounded-xl bg-slate-800 transition-transform ${isDragOver ? 'scale-110' : 'group-hover:scale-110'}`}>
                    <Upload className="w-8 h-8 text-slate-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-slate-200">Click or drag image here</p>
                    <p className="text-sm text-slate-500">Supports JPG, PNG</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!file || isLoading}
            className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all
              ${!file || isLoading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white shadow-lg shadow-indigo-500/20'
              }`}
          >
            {isLoading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Agents working…</>
            ) : 'Extract & Preview'}
          </button>
        </form>
      </div>

      {/* Agent progress log */}
      {showLog && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
            <Bot className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">Agent Activity</span>
            <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin ml-auto" />
          </div>
          <div ref={logRef} className="p-3 space-y-1.5 max-h-48 overflow-y-auto">
            {agentProgress.map((event, i) => {
              const { label, agent, done } = progressLabel(event)
              if (!label) return null
              return (
                <div key={i} className="flex items-start gap-2.5 text-xs">
                  <span className={`shrink-0 font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
                    agent === 1
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    A{agent}
                  </span>
                  {event.pass != null && (
                    <span className="shrink-0 text-slate-600">P{event.pass}</span>
                  )}
                  <span className={done ? 'text-emerald-400' : 'text-slate-400'}>{label}</span>
                  {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-px" />}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-slate-600">Powered by Claude</p>
    </div>
  )
}
