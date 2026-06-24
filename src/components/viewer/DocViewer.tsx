import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { DocType } from '@shared/types'

interface ViewerDoc {
  type: DocType
  name: string
  contentText: string
  fileUrl: string | null
}

export function DocViewer({ doc }: { doc: ViewerDoc }) {
  if (doc.type === 'pdf') {
    return (
      <div className="doc-viewer pdf">
        {doc.fileUrl ? (
          <iframe title="pdf" src={doc.fileUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
        ) : (
          <p>无法预览该 PDF</p>
        )}
      </div>
    )
  }

  if (doc.type === 'txt') {
    return (
      <pre className="doc-viewer txt" style={{ whiteSpace: 'pre-wrap' }}>
        {doc.contentText}
      </pre>
    )
  }

  // md / web → 渲染 markdown
  return (
    <div className="doc-viewer markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.contentText}</ReactMarkdown>
    </div>
  )
}
