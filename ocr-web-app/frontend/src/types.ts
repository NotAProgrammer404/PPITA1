export type ElementType = 'heading' | 'paragraph' | 'list' | 'image' | 'formula' | 'table'
export type FontSize = 'small' | 'normal' | 'large' | 'xlarge'
export type Alignment = 'left' | 'center' | 'right'
export type ImageSize = 'small' | 'medium' | 'large'

export interface StyleInfo {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  font_size?: FontSize
  alignment?: Alignment
  text_color?: string
  indent_level?: number
}

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export interface DocumentElement {
  type: ElementType
  content: string | string[] | string[][]
  column?: number
  level?: number
  style?: StyleInfo
  image_path?: string
  image_size?: ImageSize
  bbox?: BBox
  is_math?: boolean
}

export type Layout = 'single' | 'two-column' | 'three-column'

export interface DocumentData {
  title?: string
  layout?: Layout
  elements: DocumentElement[]
  width?: number
  height?: number
}

export interface ExtractResponse {
  session_id: string
  data: { document: DocumentData }
}

export interface GenerateResponse {
  latex: string
  zip_base64: string
  filename: string
}

export interface AgentEvent {
  type: 'agent' | 'pass_done' | 'critique_done' | 'converged' | 'done' | 'error'
  agent?: 1 | 2
  pass?: number
  message?: string
  elements?: number
  score?: number
  issues?: number
  acceptable?: boolean
  session_id?: string
  data?: { document: DocumentData }
  iterations?: unknown[]
}

export interface HistoryEntry {
  session_id: string
  filename: string
  timestamp: string
  rating?: number
  latex_preview?: string
  comment?: string
}
