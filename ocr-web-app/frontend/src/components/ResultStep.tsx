import { useState } from 'react'
import { Download, Copy, Check, RotateCcw, ExternalLink, Star, ShieldCheck, Loader2, AlertTriangle, CheckCircle, Info, FileText } from 'lucide-react'
import type { GenerateResponse } from '../types'

interface VerificationIssue {
  severity: 'low' | 'medium' | 'high'
  description: string
  suggestion: string
}

interface VerificationReport {
  accuracy_score: number
  issues: VerificationIssue[]
  missing_elements: string[]
  summary: string
}

interface Props {
  result: GenerateResponse
  sessionId: string
  onFeedback: (rating: number, comment: string) => void
  onReset: () => void
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SEVERITY_STYLES = {
  high:   { bar: 'bg-red-500',    badge: 'bg-red-500/20 text-red-300 border-red-500/30',    icon: AlertTriangle },
  medium: { bar: 'bg-yellow-500', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: Info },
  low:    { bar: 'bg-blue-500',   badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',  icon: Info },
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  const ring  = score >= 80 ? 'stroke-emerald-400' : score >= 60 ? 'stroke-yellow-400' : 'stroke-red-400'
  const r = 28
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  return (
    <div className="relative flex items-center justify-center w-20 h-20">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" className={ring} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className={`text-xl font-bold ${color}`}>{score}</span>
    </div>
  )
}

export default function ResultStep({ result, sessionId, onFeedback, onReset }: Props) {
  const [copied, setCopied] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [feedbackDone, setFeedbackDone] = useState(false)

  const [compiling, setCompiling] = useState(false)
  const [compileError, setCompileError] = useState<string | null>(null)

  const [verifying, setVerifying] = useState(false)
  const [report, setReport] = useState<VerificationReport | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.latex)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const bytes = Uint8Array.from(atob(result.zip_base64), c => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleOpenOverleaf = () => {
    const form = document.createElement('form')
    form.action = 'https://www.overleaf.com/docs'
    form.method = 'post'
    form.target = '_blank'
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'snip'
    input.value = result.latex
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  }

  const handleCompilePDF = async () => {
    setCompiling(true)
    setCompileError(null)
    try {
      const res = await fetch(`${API_URL}/api/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, latex: result.latex }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || res.statusText)
      }
      const data = await res.json()
      const bytes = Uint8Array.from(atob(data.pdf_base64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = data.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setCompileError(e instanceof Error ? e.message : 'Compilation failed')
    } finally {
      setCompiling(false)
    }
  }

  const handleVerify = async () => {
    setVerifying(true)
    setVerifyError(null)
    try {
      const res = await fetch(`${API_URL}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, latex: result.latex }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || res.statusText)
      }
      setReport(await res.json())
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const handleRating = (r: number) => {
    setRating(r)
    onFeedback(r, '')
    setFeedbackDone(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">LaTeX Generated</h2>
        <button onClick={onReset} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          <RotateCcw className="w-3.5 h-3.5" /> New Document
        </button>
      </div>

      {/* LaTeX source preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
          <span className="text-xs text-slate-500 font-mono">document.tex</span>
          <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
            {copied
              ? <><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
              : <><Copy className="w-3.5 h-3.5" />Copy</>}
          </button>
        </div>
        <pre className="p-4 text-xs text-slate-300 font-mono overflow-auto max-h-52 leading-relaxed whitespace-pre-wrap">
          {result.latex}
        </pre>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={handleDownload}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-500/20">
          <Download className="w-4 h-4" /> Download ZIP
        </button>
        <button onClick={handleOpenOverleaf}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold transition-all">
          <ExternalLink className="w-4 h-4" /> Open in Overleaf
        </button>
        <button
          onClick={handleCompilePDF}
          disabled={compiling}
          className={`col-span-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all
            ${compiling
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-rose-700 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20'
            }`}
        >
          {compiling
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Compiling PDF…</>
            : <><FileText className="w-4 h-4" /> Compile &amp; Download PDF</>
          }
        </button>
      </div>

      {compileError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">{compileError}</p>
        </div>
      )}

      {/* Verification agent */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <div>
              <p className="text-sm font-semibold text-white">Verification Agent</p>
              <p className="text-xs text-slate-500">Compares original image against generated LaTeX</p>
            </div>
          </div>
          {!report && (
            <button
              onClick={handleVerify}
              disabled={verifying}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${verifying ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
            >
              {verifying ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying…</> : 'Run Verification'}
            </button>
          )}
        </div>

        {verifyError && (
          <div className="p-4 text-sm text-red-300">{verifyError}</div>
        )}

        {report && (
          <div className="p-4 space-y-4">
            {/* Score + summary */}
            <div className="flex items-center gap-4">
              <ScoreRing score={report.accuracy_score} />
              <div>
                <p className="text-sm font-semibold text-white mb-0.5">
                  {report.accuracy_score >= 80 ? 'Good transcription' : report.accuracy_score >= 60 ? 'Needs review' : 'Significant issues found'}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">{report.summary}</p>
              </div>
            </div>

            {/* Missing elements */}
            {report.missing_elements.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Missing Elements</p>
                <div className="flex flex-wrap gap-2">
                  {report.missing_elements.map((el, i) => (
                    <span key={i} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2 py-1 rounded-full">
                      {el}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Issues */}
            {report.issues.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Issues Found</p>
                {report.issues.map((issue, i) => {
                  const s = SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.low
                  const Icon = s.icon
                  return (
                    <div key={i} className="bg-slate-800/60 rounded-lg p-3 flex gap-3">
                      <div className={`w-0.5 rounded-full shrink-0 ${s.bar}`} />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-slate-400" />
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${s.badge}`}>
                            {issue.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">{issue.description}</p>
                        <p className="text-xs text-slate-500 italic">{issue.suggestion}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {report.issues.length === 0 && report.missing_elements.length === 0 && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle className="w-4 h-4" /> No issues found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feedback */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-sm text-slate-400 mb-3">How accurate was the transcription?</p>
        {feedbackDone ? (
          <p className="text-sm text-emerald-400">Thanks for your feedback!</p>
        ) : (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(r => (
              <button key={r}
                onMouseEnter={() => setHovered(r)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => handleRating(r)}
                className="transition-transform hover:scale-110">
                <Star className={`w-7 h-7 transition-colors ${r <= (hovered || rating) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'}`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
