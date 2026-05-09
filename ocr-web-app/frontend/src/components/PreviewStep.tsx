import { useState } from 'react'
import { ArrowLeft, ArrowRight, Trash2, Loader2, AlertCircle } from 'lucide-react'
import type { DocumentData, DocumentElement } from '../types'

interface Props {
  docData: { document: DocumentData }
  filename: string
  isLoading: boolean
  error: string | null
  onGenerate: (data: { document: DocumentData }) => void
  onBack: () => void
}

const TYPE_BADGE: Record<string, string> = {
  heading:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
  paragraph: 'bg-slate-700/60 text-slate-300 border-slate-600',
  list:      'bg-green-500/20 text-green-300 border-green-500/30',
  table:     'bg-purple-500/20 text-purple-300 border-purple-500/30',
  formula:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
  image:     'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
}

function contentToText(el: DocumentElement): string {
  if (typeof el.content === 'string') return el.content
  if (el.type === 'list') return (el.content as string[]).join('\n')
  if (el.type === 'table') return (el.content as string[][]).map(r => r.join(' | ')).join('\n')
  return JSON.stringify(el.content)
}

function textToContent(text: string, type: string): string | string[] | string[][] {
  if (type === 'list') return text.split('\n').filter(Boolean)
  if (type === 'table') return text.split('\n').map(r => r.split('|').map(c => c.trim()))
  return text
}

export default function PreviewStep({ docData, filename, isLoading, error, onGenerate, onBack }: Props) {
  const [elements, setElements] = useState<DocumentElement[]>(docData.document.elements)
  const [title, setTitle] = useState(docData.document.title ?? '')

  const update = (i: number, patch: Partial<DocumentElement>) =>
    setElements(prev => prev.map((el, idx) => idx === i ? { ...el, ...patch } : el))

  const remove = (i: number) =>
    setElements(prev => prev.filter((_, idx) => idx !== i))

  const handleGenerate = () =>
    onGenerate({ document: { ...docData.document, title, elements } })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Review Extracted Content</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {elements.length} elements · {filename}
            {docData.document.layout && docData.document.layout !== 'single' && (
              <span className="ml-2 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                {docData.document.layout}
              </span>
            )}
          </p>
        </div>
        <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
          Human-in-the-Loop ✓
        </span>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {/* Title row */}
        <div className="p-4 border-b border-slate-800">
          <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">
            Document Title
          </label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Untitled"
          />
        </div>

        {/* Elements list */}
        <div className="divide-y divide-slate-800/60 max-h-[52vh] overflow-y-auto">
          {elements.map((el, i) => (
            <div key={i} className="p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                {/* Type selector */}
                <select
                  value={el.type}
                  onChange={e => update(i, { type: e.target.value as DocumentElement['type'] })}
                  className={`text-xs font-medium px-2 py-1 rounded border bg-transparent cursor-pointer focus:outline-none ${TYPE_BADGE[el.type] ?? TYPE_BADGE.paragraph}`}
                >
                  {['heading', 'paragraph', 'list', 'table', 'formula', 'image'].map(t => (
                    <option key={t} value={t} className="bg-slate-800 text-white">{t}</option>
                  ))}
                </select>

                {el.type === 'heading' && (
                  <select
                    value={el.level ?? 1}
                    onChange={e => update(i, { level: Number(e.target.value) })}
                    className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none"
                  >
                    <option value={1}>H1</option>
                    <option value={2}>H2</option>
                    <option value={3}>H3</option>
                  </select>
                )}

                <div className="flex items-center gap-1 ml-auto">
                  {(el.type === 'paragraph' || el.type === 'heading') && (
                    <>
                      {(['bold', 'italic', 'underline'] as const).map(prop => (
                        <button
                          key={prop}
                          onClick={() => update(i, { style: { ...el.style, [prop]: !el.style?.[prop] } })}
                          className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                            el.style?.[prop]
                              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                              : 'border-slate-700 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {prop === 'bold' ? 'B' : prop === 'italic' ? 'I' : 'U'}
                        </button>
                      ))}
                    </>
                  )}
                  <button
                    onClick={() => remove(i)}
                    className="ml-1 p-1 text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {el.type === 'image' ? (
                <p className="text-xs text-slate-500 italic px-1">
                  Image region — will be cropped from original and embedded in LaTeX output.
                </p>
              ) : (
                <textarea
                  value={contentToText(el)}
                  onChange={e => update(i, { content: textToContent(e.target.value, el.type) })}
                  rows={el.type === 'list' || el.type === 'table' ? 4 : 2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-y transition-colors"
                  placeholder={
                    el.type === 'list' ? 'One item per line'
                    : el.type === 'table' ? 'Row: cell | cell | cell'
                    : el.type === 'formula' ? 'LaTeX math expression'
                    : 'Content…'
                  }
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all
            ${isLoading
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
            }`}
        >
          {isLoading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Generating LaTeX…</>
          ) : (
            <>Generate LaTeX <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </div>
    </div>
  )
}
