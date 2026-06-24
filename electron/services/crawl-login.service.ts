import type Database from 'better-sqlite3'
import { ok, err, isOk, type Result, type Document } from '@shared/types'
import { ingestWebDoc } from './crawl.service'

export interface CapturedPage {
  html: string
  finalUrl: string
}

export interface InteractiveDeps {
  /**
   * 打开内置浏览器窗口加载 url，等待用户登录/导航并点击「抓取当前页」，
   * 返回当前已登录页面的 HTML 与最终 URL；用户取消/关闭窗口返回 null。
   */
  capturePage: (url: string) => Promise<CapturedPage | null>
}

/**
 * 交互式登录爬取（spec A4）：开窗口让用户登录 → 抓取当前页 → 复用 ingestWebDoc 入库。
 * 取消 → E_CANCELLED 且不落空文档；无效链接在开窗前即拒绝。
 */
export async function fromUrlInteractive(
  db: Database.Database,
  input: { url: string; folderId: string | null; storageDir?: string },
  deps: InteractiveDeps = { capturePage: defaultCapture }
): Promise<Result<Document>> {
  let u: URL
  try {
    u = new URL(input.url)
  } catch {
    return err('E_INVALID_URL', '无效的链接')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return err('E_INVALID_URL', '仅支持 http/https 链接')
  }

  const captured = await deps.capturePage(input.url)
  if (!captured) return err('E_CANCELLED', '已取消')

  const result = ingestWebDoc(db, {
    html: captured.html,
    url: captured.finalUrl || input.url,
    folderId: input.folderId,
    storageDir: input.storageDir
  })
  if (!isOk(result)) return err(result.error.code, result.error.message)
  return ok(result.data)
}

// ── 默认实现：Electron BrowserWindow（仅主进程运行；单元测试注入替身，不走此路径） ──
const CAPTURE_FLAG = '__mdocsCaptured__'
const CAPTURE_BUTTON_ID = '__mdocsCaptureBtn__'

async function defaultCapture(url: string): Promise<CapturedPage | null> {
  const { BrowserWindow } = await import('electron')
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    title: '登录后点击「抓取当前页」',
    webPreferences: { partition: `crawl-${Date.now()}` } // 临时会话，不持久化登录凭据
  })

  return new Promise<CapturedPage | null>((resolve) => {
    let settled = false
    const finish = (value: CapturedPage | null) => {
      if (settled) return
      settled = true
      clearInterval(timer)
      if (!win.isDestroyed()) win.destroy()
      resolve(value)
    }

    win.on('closed', () => finish(null))
    win.loadURL(url).catch(() => finish(null))

    // 注入一个悬浮「抓取当前页」按钮；点击后置标记，由轮询取走 HTML。
    const injectButton = () => {
      win.webContents
        .executeJavaScript(
          `(() => {
            if (document.getElementById('${CAPTURE_BUTTON_ID}')) return;
            const b = document.createElement('button');
            b.id = '${CAPTURE_BUTTON_ID}';
            b.textContent = '抓取当前页';
            b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
            b.onclick = () => { window['${CAPTURE_FLAG}'] = true; b.disabled = true; b.textContent = '已抓取'; };
            document.body.appendChild(b);
          })();`
        )
        .catch(() => {})
    }
    win.webContents.on('dom-ready', injectButton)

    const timer = setInterval(() => {
      if (win.isDestroyed()) return
      win.webContents
        .executeJavaScript(
          `(window['${CAPTURE_FLAG}'] ? JSON.stringify({ html: document.documentElement.outerHTML, finalUrl: location.href }) : '')`
        )
        .then((raw: string) => {
          if (raw) finish(JSON.parse(raw) as CapturedPage)
        })
        .catch(() => {})
    }, 500)
  })
}
