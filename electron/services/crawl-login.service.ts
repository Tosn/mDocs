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
    width: 1280,
    height: 900,
    title: '登录后点击「抓取当前页」',
    // 固定持久分区：cookie/登录态落盘到 userData，跨爬取与重启保留，登录一次即可。
    webPreferences: { partition: 'persist:crawl' }
  })
  // 用标准 Chrome UA：飞书等站点对 Electron UA 会降级渲染（表格只出骨架）。
  win.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  )

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

    // 注入一个悬浮「抓取当前页」按钮；点击后先自动滚动整篇（触发飞书等虚拟滚动文档
    // 的全量懒渲染 + 等待表格加载完成），再置标记，由轮询取走完整 HTML。
    const injectButton = () => {
      win.webContents
        .executeJavaScript(
          `(() => {
            if (document.getElementById('${CAPTURE_BUTTON_ID}')) return;
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            // 选出最可能的滚动容器（飞书的滚动区是内层 div，不是 window）。
            const findScroller = () => {
              let best = document.scrollingElement || document.documentElement;
              let score = best.scrollHeight - best.clientHeight;
              document.querySelectorAll('div').forEach((el) => {
                const s = el.scrollHeight - el.clientHeight;
                if (s <= score) return;
                const oy = getComputedStyle(el).overflowY;
                if (oy === 'auto' || oy === 'scroll') { best = el; score = s; }
              });
              return best;
            };
            // 逐屏增量滚动：每个块进视口才会触发飞书的懒渲染（直接跳到底会略过中间块），
            // 每步停顿等表格等异步块加载完成；到底且高度稳定后停止，再滚回顶部。
            const autoScroll = async () => {
              const sc = findScroller();
              const step = () => Math.max(200, sc.clientHeight - 120);
              let last = -1, stable = 0;
              for (let i = 0; i < 1500; i++) {
                sc.scrollTop = Math.min(sc.scrollTop + step(), sc.scrollHeight);
                await sleep(450);
                const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
                const h = sc.scrollHeight;
                if (atBottom) {
                  if (h === last) { if (++stable >= 3) break; } else { stable = 0; last = h; }
                }
              }
              sc.scrollTop = 0;
              await sleep(600);
            };
            const b = document.createElement('button');
            b.id = '${CAPTURE_BUTTON_ID}';
            b.textContent = '抓取当前页';
            b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
            b.onclick = async () => {
              b.disabled = true;
              // 仅飞书/Lark 需要滚动加载（虚拟滚动+懒渲染）；其他站点点击即抓，保持原行为。
              const host = location.hostname;
              const needScroll = /feishu\\.(cn|net)$/.test(host) || /larksuite\\.com$/.test(host);
              if (needScroll) {
                b.textContent = '抓取中…(滚动加载，请稍候)';
                try { await autoScroll(); } catch (e) {}
              }
              window['${CAPTURE_FLAG}'] = true;
              b.textContent = '已抓取';
            };
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
