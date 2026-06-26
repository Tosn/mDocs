export type MenuItem = { label: string; onClick: () => void; danger?: boolean } | 'separator'

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/** 轻量右键/弹出菜单：点空白或 Esc 关闭，选项点击后自动关闭。 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <div
      className="context-menu-backdrop"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        className="context-menu"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) =>
          it === 'separator' ? (
            <div key={i} className="context-menu-sep" />
          ) : (
            <button
              key={i}
              className={it.danger ? 'danger' : undefined}
              onClick={() => {
                it.onClick()
                onClose()
              }}
            >
              {it.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}
