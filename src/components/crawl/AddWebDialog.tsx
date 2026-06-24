import { useState } from 'react'
import { isOk, type Result } from '@shared/types'

interface AddWebDialogProps {
  onCrawl: (url: string) => Promise<Result<{ name: string }>>
  onInteractiveCrawl: (url: string) => Promise<Result<{ name: string }>>
  onClose?: () => void
}

/** 添加网页对话框：普通抓取，或需登录时用内置窗口交互抓取（spec A4）。 */
export function AddWebDialog({ onCrawl, onInteractiveCrawl, onClose }: AddWebDialogProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: (url: string) => Promise<Result<{ name: string }>>) => {
    const target = url.trim()
    if (!target || busy) return
    setBusy(true)
    setError(null)
    const res = await fn(target)
    setBusy(false)
    if (isOk(res)) {
      onClose?.()
    } else {
      setError(res.error.message)
    }
  }

  return (
    <div className="add-web-dialog">
      <input
        type="text"
        placeholder="粘贴网页链接（http/https）"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
      />
      <div className="actions">
        <button onClick={() => run(onCrawl)} disabled={busy || url.trim() === ''}>
          添加
        </button>
        <button onClick={() => run(onInteractiveCrawl)} disabled={busy || url.trim() === ''}>
          需要登录？用浏览器打开后抓取
        </button>
      </div>
      {error && (
        <p data-testid="error" className="error">
          {error}
        </p>
      )}
    </div>
  )
}
