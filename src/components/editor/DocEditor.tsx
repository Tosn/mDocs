interface DocEditorProps {
  value: string
  dirty: boolean
  editable: boolean
  onChange: (value: string) => void
  onSave: () => void
}

export function DocEditor({ value, dirty, editable, onChange, onSave }: DocEditorProps) {
  if (!editable) {
    return <p className="doc-editor notice">该类型文档不支持编辑（仅支持改名）。</p>
  }
  return (
    <div className="doc-editor">
      <div className="toolbar">
        <button onClick={onSave}>保存</button>
        {dirty && <span className="dirty">● 未保存</span>}
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
