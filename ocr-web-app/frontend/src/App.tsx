import { useState, useCallback } from 'react'
import UploadStep from './components/UploadStep'
import PreviewStep from './components/PreviewStep'
import ResultStep from './components/ResultStep'
import HistoryPanel from './components/HistoryPanel'
import type { DocumentData, GenerateResponse, HistoryEntry, AgentEvent } from './types'
import './index.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type Step = 'upload' | 'preview' | 'result'
const STEPS: Step[] = ['upload', 'preview', 'result']
const STEP_LABELS = { upload: 'Upload', preview: 'Review', result: 'Export' }

export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [docData, setDocData] = useState<{ document: DocumentData } | null>(null)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [filename, setFilename] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [agentProgress, setAgentProgress] = useState<AgentEvent[]>([])

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/history`)
      if (res.ok) {
        const data = await res.json()
        setHistory(data.history)
      }
    } catch {
      // history is non-critical
    }
  }, [])

  const handleExtract = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    setFilename(file.name)
    setAgentProgress([])

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_URL}/api/extract`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || res.statusText)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          if (!chunk.startsWith('data: ')) continue
          const event: AgentEvent = JSON.parse(chunk.slice(6))
          if (event.type === 'done') {
            setSessionId(event.session_id!)
            setDocData(event.data!)
            setStep('preview')
            setIsLoading(false)
          } else if (event.type === 'error') {
            throw new Error(event.message ?? 'Extraction failed')
          } else {
            setAgentProgress(prev => [...prev, event])
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed')
      setIsLoading(false)
    }
  }, [])

  const handleGenerate = useCallback(async (editedData: { document: DocumentData }) => {
    if (!sessionId) return
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, data: editedData }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || res.statusText)
      }
      const data: GenerateResponse = await res.json()
      setResult(data)
      setStep('result')
      refreshHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, refreshHistory])

  const handleFeedback = useCallback(async (rating: number, comment: string) => {
    if (!sessionId) return
    await fetch(`${API_URL}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, rating, comment }),
    })
    setHistory(prev => prev.map(h => h.session_id === sessionId ? { ...h, rating } : h))
  }, [sessionId])

  const handleReset = useCallback(() => {
    setStep('upload')
    setSessionId(null)
    setDocData(null)
    setResult(null)
    setError(null)
    setFilename('')
    setAgentProgress([])
  }, [])

  const currentStepIndex = STEPS.indexOf(step)

  return (
    <div className="min-h-screen bg-slate-950 text-white flex">
      <div className={`flex-1 flex flex-col items-center justify-center p-6 transition-all duration-300 ${showHistory ? 'mr-80' : ''}`}>
        <div className="absolute inset-0 bg-linear-to-tr from-indigo-500/10 via-purple-500/10 to-slate-950 pointer-events-none" />

        {/* Step indicator */}
        <div className="relative z-10 flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-all duration-200
                ${step === s
                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/30'
                  : currentStepIndex > i
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-500'}`}
              >
                {currentStepIndex > i ? '✓' : i + 1}
              </div>
              <span className={`text-sm transition-colors ${step === s ? 'text-white font-medium' : 'text-slate-500'}`}>
                {STEP_LABELS[s]}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px mx-1 transition-colors ${currentStepIndex > i ? 'bg-emerald-600' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}

          <button
            onClick={() => {
              setShowHistory(v => !v)
              if (!showHistory) refreshHistory()
            }}
            className="ml-6 text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            {showHistory ? 'Hide History' : 'History'}
          </button>
        </div>

        <div className="relative z-10 w-full max-w-2xl">
          {step === 'upload' && (
            <UploadStep onExtract={handleExtract} isLoading={isLoading} error={error} agentProgress={agentProgress} />
          )}
          {step === 'preview' && docData && (
            <PreviewStep
              docData={docData}
              filename={filename}
              isLoading={isLoading}
              error={error}
              onGenerate={handleGenerate}
              onBack={handleReset}
            />
          )}
          {step === 'result' && result && sessionId && (
            <ResultStep
              result={result}
              sessionId={sessionId}
              onFeedback={handleFeedback}
              onReset={handleReset}
            />
          )}
        </div>
      </div>

      {showHistory && (
        <HistoryPanel history={history} onClose={() => setShowHistory(false)} />
      )}
    </div>
  )
}
