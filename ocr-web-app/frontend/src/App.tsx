import { useState } from 'react'
import { Upload, FileText, Download, Loader2, AlertCircle, Sparkles } from 'lucide-react'
import './index.css' // Ensure index is imported

// Use environment variable or default to localhost:8000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
      setDownloadUrl(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
      setError(null)
      setDownloadUrl(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setIsProcessing(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${API_URL}/api/convert`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      setDownloadUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during conversion')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 relative overflow-hidden">
        {/* Subtle Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-purple-500/10 to-slate-950 pointer-events-none" />

        <div className="w-full max-w-lg z-10">
            {/* Header */}
            <div className="text-center mb-10 space-y-3">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800 shadow-xl ring-1 ring-white/10 mb-2">
                    <Sparkles className="w-7 h-7 text-indigo-400" />
                </div>
                <h1 className="text-4xl font-bold tracking-tight text-white">
                    Layout OCR
                </h1>
                <p className="text-slate-400 font-light text-lg">
                    Convert images to editable documents instantly.
                </p>
            </div>

            {/* Main Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                <form onSubmit={handleSubmit} className="p-8 space-y-8">
                    {/* File Upload Area */}
                    <div
                        className={`
                            relative group border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ease-out cursor-pointer
                            ${isDragOver 
                                ? 'border-indigo-500 bg-indigo-500/5' 
                                : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
                            }
                        `}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <input
                            type="file"
                            onChange={handleFileChange}
                            accept="image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                        />

                        <div className="flex flex-col items-center gap-4">
                             {file ? (
                                <>
                                    <div className="p-3 bg-indigo-500/20 rounded-lg">
                                        <FileText className="w-8 h-8 text-indigo-400" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-white break-all line-clamp-1">{file.name}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wide">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                    <span className="text-xs text-indigo-400 font-medium bg-indigo-400/10 px-3 py-1 rounded-full">Change File</span>
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

                    {/* Error Handling */}
                     {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                            <p className="text-sm text-red-200">{error}</p>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={!file || isProcessing}
                        className={`
                            w-full py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-white transition-all
                            ${!file || isProcessing
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] shadow-lg shadow-indigo-500/20'
                            }
                        `}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Converting...
                            </>
                        ) : (
                            'Convert Document'
                        )}
                    </button>
                </form>

                {/* Success Banner */}
                 {downloadUrl && (
                    <div className="bg-emerald-500/10 border-t border-emerald-500/20 p-6">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/20 rounded-full">
                                    <Download className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div className="text-left">
                                    <p className="font-medium text-emerald-100">Ready for Download</p>
                                </div>
                            </div>
                            <a 
                                href={downloadUrl}
                                download={`ocr-result-${file?.name ? file.name.split('.')[0] : 'doc'}.docx`}
                                className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                                Download Now &rarr;
                            </a>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="mt-8 text-center">
                 <p className="text-xs text-slate-600">Powered by Gemini Pro Vision</p>
            </div>
        </div>
    </div>
  )
}

export default App
