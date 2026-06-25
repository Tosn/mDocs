import { useEffect, useRef, useState } from 'react'

interface PromptDialogProps {
  title: string
  defaultValue?: string
  confirmLabel?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

/** 应用内文本输入弹窗，替代 Electron 渲染进程不支持的 window.prompt()。 */
export function PromptDialog({
  title,
  defaultValue = '',
  confirmLabel = '确定',
  onSubmit,
  onCancel
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <div className="prompt-dialog-overlay" onMouseDown={onCancel}>
      <div data-testid="prompt-dialog" className="prompt-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="prompt-title">{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            else if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="actions">
          <button onClick={onCancel}>取消</button>
          <button onClick={submit} disabled={value.trim() === ''}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
