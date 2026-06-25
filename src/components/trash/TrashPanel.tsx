import { useState } from 'react'

interface TrashEntry {
  id: string
  itemType: 'folder' | 'document'
  name: string
  deletedAt: number
  purgeAfter: number
}

interface TrashPanelProps {
  items: TrashEntry[]
  onRestore: (id: string) => void
  onPurge: (id: string) => void
  onRestoreMany: (ids: string[]) => void
  onPurgeMany: (ids: string[]) => void
}

const DAY = 24 * 60 * 60 * 1000

/** 回收站：列出已删除项，支持单项与批量恢复/彻底删除（项目不变量：删除后保留 7 天）。 */
export function TrashPanel({ items, onRestore, onPurge, onRestoreMany, onPurgeMany }: TrashPanelProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const selectedIds = items.filter((it) => selected[it.id]).map((it) => it.id)
  const allChecked = items.length > 0 && selectedIds.length === items.length

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }))
  const toggleAll = () =>
    setSelected(allChecked ? {} : Object.fromEntries(items.map((it) => [it.id, true])))
  const clear = () => setSelected({})

  return (
    <div className="trash-panel">
      <div className="trash-head">
        <h3 className="trash-title">回收站</h3>
        {items.length > 0 && (
          <label className="trash-selectall">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="全选" />
            全选
          </label>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="trash-batch">
          <span>已选 {selectedIds.length} 项</span>
          <button
            onClick={() => {
              onRestoreMany(selectedIds)
              clear()
            }}
          >
            批量恢复
          </button>
          <button
            className="danger"
            onClick={() => {
              onPurgeMany(selectedIds)
              clear()
            }}
          >
            批量彻底删除
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty">回收站为空。已删除的文件夹/文档会在此保留 7 天。</p>
      ) : (
        <ul className="trash-list">
          {items.map((it) => {
            const daysLeft = Math.max(0, Math.ceil((it.purgeAfter - Date.now()) / DAY))
            return (
              <li key={it.id}>
                <input
                  type="checkbox"
                  className="trash-check"
                  checked={!!selected[it.id]}
                  onChange={() => toggle(it.id)}
                  aria-label={`选择 ${it.name}`}
                />
                <span className="trash-kind" data-kind={it.itemType}>
                  {it.itemType === 'folder' ? '文件夹' : '文档'}
                </span>
                <span className="trash-name">{it.name}</span>
                <span className="trash-meta">{daysLeft} 天后彻底删除</span>
                <button aria-label={`恢复 ${it.name}`} onClick={() => onRestore(it.id)}>
                  恢复
                </button>
                <button
                  className="danger"
                  aria-label={`彻底删除 ${it.name}`}
                  onClick={() => onPurge(it.id)}
                >
                  彻底删除
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
