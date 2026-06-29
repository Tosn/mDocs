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
   * dynamic=true 时先自动滚动整篇触发懒渲染/虚拟滚动加载，再抓取。
   */
  capturePage: (url: string, dynamic?: boolean) => Promise<CapturedPage | null>
}

/**
 * 交互式爬取（spec A4）：开窗口让用户登录/渲染 → 抓取当前页 → 复用 ingestWebDoc 入库。
 * - 静态爬取（dynamic=false）：点击即抓 + 通用 Readability 解析。
 * - 动态爬取（dynamic=true）：滚动渲染后抓 + 飞书式结构化解析（非飞书页回退通用）。
 * 取消 → E_CANCELLED 且不落空文档；无效链接在开窗前即拒绝。
 */
export async function fromUrlInteractive(
  db: Database.Database,
  input: { url: string; folderId: string | null; storageDir?: string; dynamic?: boolean },
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

  const captured = await deps.capturePage(input.url, input.dynamic)
  if (!captured) return err('E_CANCELLED', '已取消')

  const result = ingestWebDoc(db, {
    html: captured.html,
    url: captured.finalUrl || input.url,
    folderId: input.folderId,
    storageDir: input.storageDir,
    dynamic: input.dynamic
  })
  if (!isOk(result)) return err(result.error.code, result.error.message)
  return ok(result.data)
}

// ── 默认实现：Electron BrowserWindow（仅主进程运行；单元测试注入替身，不走此路径） ──
const CAPTURE_FLAG = '__mdocsCaptured__'
const CAPTURE_BUTTON_ID = '__mdocsCaptureBtn__'

async function defaultCapture(url: string, dynamic = false): Promise<CapturedPage | null> {
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
  // 飞书等 SPA 会多次客户端导航，Electron 内部按导航累积 did-stop-loading 监听器，
  // 抬高上限避免 MaxListenersExceededWarning（非真实泄漏）。
  win.webContents.setMaxListeners(50)

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
            // 飞书是虚拟滚动：滚出视口的块会从 DOM 移除，单纯「滚到底再抓」只剩最后视口。
            // 故边滚边采集每个顶层块，按文档内绝对纵坐标累积去重（保留最完整版本），最后重组。
            const collected = new Map();
            const collect = () => {
              const sc = findScroller();
              const scRect = sc.getBoundingClientRect();
              document.querySelectorAll('.block[data-block-type]').forEach((el) => {
                if (el.closest('[data-block-type="table_cell"]')) return; // 表格内部块随表格整体采集
                const id = el.getAttribute('data-block-id') || el.getAttribute('data-record-id');
                if (!id) return;
                const rect = el.getBoundingClientRect();
                const y = rect.top - scRect.top + sc.scrollTop; // 滚动容器内绝对纵坐标，稳定可排序
                const html = el.outerHTML;
                const prev = collected.get(id);
                if (!prev || html.length >= prev.html.length) collected.set(id, { y: y, html: html });
              });
            };
            const buildHtml = () => {
              if (collected.size === 0) return ''; // 非飞书结构（无块）→ 让外层回退 outerHTML
              const items = Array.from(collected.values()).sort((a, b) => a.y - b.y);
              const body = items.map((i) => i.html).join('\\n');
              return '<html><head><title>' + (document.title || '') + '</title></head><body>' + body + '</body></html>';
            };
            // 逐屏增量滚动：每步进视口触发懒渲染并采集当前块；到底且高度稳定后停止。
            const autoScroll = async () => {
              const sc = findScroller();
              const step = () => Math.max(200, sc.clientHeight - 160); // 留 160px 重叠，避免漏块
              let last = -1, stable = 0;
              sc.scrollTop = 0;
              await sleep(300);
              collect();
              for (let i = 0; i < 2000; i++) {
                sc.scrollTop = Math.min(sc.scrollTop + step(), sc.scrollHeight);
                await sleep(420);
                collect();
                const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
                const h = sc.scrollHeight;
                if (atBottom) {
                  if (h === last) { if (++stable >= 3) break; } else { stable = 0; last = h; }
                }
              }
              await sleep(300);
              collect();
            };
            const b = document.createElement('button');
            b.id = '${CAPTURE_BUTTON_ID}';
            b.textContent = '抓取当前页';
            b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 16px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
            const DYNAMIC = ${dynamic ? 'true' : 'false'};
            b.onclick = async () => {
              b.disabled = true;
              // 动态爬取：先滚动整篇触发懒渲染/虚拟滚动加载完成，再抓取（适合飞书等动态文档）；
              // 静态爬取：点击即抓，不滚动。
              if (DYNAMIC) {
                b.textContent = '抓取中…(滚动加载，请稍候)';
                try { await autoScroll(); window['__mdocsFullHtml__'] = buildHtml(); } catch (e) {}
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
          `(window['${CAPTURE_FLAG}'] ? JSON.stringify({ html: window['__mdocsFullHtml__'] || document.documentElement.outerHTML, finalUrl: location.href }) : '')`
        )
        .then((raw: string) => {
          if (raw) finish(JSON.parse(raw) as CapturedPage)
        })
        .catch(() => {})
    }, 500)
  })
}
