import { useState } from 'react'
import { isOk, type Result } from '@shared/types'

interface AddWebDialogProps {
  onCrawl: (url: string) => Promise<Result<{ name: string }>>
  onInteractiveCrawl: (url: string) => Promise<Result<{ name: string }>>
  onClose?: () => void
}

/**
 * 添加网页对话框（spec A4）。两种抓取方式：
 * - 静态爬取：直接抓取 HTML 解析，快，适合普通文章网页。
 * - 动态爬取：打开内置浏览器渲染 JS 后抓取（可登录、可滚动加载），
 *   适合飞书文档这类动态渲染 / 需登录的页面。
 */
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
          静态爬取
        </button>
        <button onClick={() => run(onInteractiveCrawl)} disabled={busy || url.trim() === ''}>
          动态爬取
        </button>
        {onClose && (
          <button className="cancel" onClick={onClose} disabled={busy}>
            取消
          </button>
        )}
      </div>
      <p className="add-web-hint">
        静态爬取：直接抓取，适合普通网页。动态爬取：打开浏览器渲染后抓取，适合飞书等动态渲染或需登录的页面。
      </p>
      {error && (
        <p data-testid="error" className="error">
          {error}
        </p>
      )}
    </div>
  )
}
