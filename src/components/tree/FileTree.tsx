import { useEffect, useRef, useState } from 'react'
import type { DocType } from '@shared/types'

export interface FolderNode {
  kind: 'folder'
  folderId: string | null // null = 默认（未归类文档的默认存放处）
  name: string
  isDefault: boolean
  docCount: number
  children: FileNode[]
}
export interface DocNode {
  kind: 'doc'
  id: string
  name: string // 已含扩展名（由上层组装）
  docType: DocType
}
export type FileNode = FolderNode | DocNode

export type CtxTarget =
  | { kind: 'folder'; folderId: string | null; name: string; isDefault: boolean }
  | { kind: 'doc'; id: string; name: string }

interface FileTreeProps {
  nodes: FileNode[]
  expanded: Record<string, boolean>
  onToggle: (key: string) => void
  selectedFolderId: string | null
  openDocId: string | null
  onSelectFolder: (folderId: string | null) => void
  onOpenDoc: (id: string) => void
  onRenameFolder: (folderId: string, name: string) => void
  onRenameDoc: (id: string, name: string) => void
  onMoveDoc: (docId: string, folderId: string | null) => void
  onContextMenu?: (target: CtxTarget, x: number, y: number) => void
  /** 左侧空白处右键（创建类操作）。 */
  onBackgroundContextMenu?: (x: number, y: number) => void
  /** 受控触发某节点进入内联编辑（供右键「重命名」使用）。key 形如 f:<id> / d:<id>。 */
  editRequest?: { key: string; name: string } | null
  onEditDone?: () => void
}

const DEFAULT_KEY = '__default__'
const keyOf = (folderId: string | null) => folderId ?? DEFAULT_KEY

/** VSCode 式统一文件树：文件夹可展开，文件为叶子（点击打开）；选中行回车 / 双击名称内联改名。 */
export function FileTree({
  nodes,
  expanded,
  onToggle,
  selectedFolderId,
  openDocId,
  onSelectFolder,
  onOpenDoc,
  onRenameFolder,
  onRenameDoc,
  onMoveDoc,
  onContextMenu,
  onBackgroundContextMenu,
  editRequest,
  onEditDone
}: FileTreeProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dropKey, setDropKey] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    // 文件：只选中扩展名之前的部分（如 test.txt → 选「test」）；文件夹：全选。
    const dot = el.value.lastIndexOf('.')
    if (editing.startsWith('d:') && dot > 0) el.setSelectionRange(0, dot)
    else el.select()
  }, [editing])

  useEffect(() => {
    if (editRequest) {
      setEditing(editRequest.key)
      setDraft(editRequest.name)
    }
  }, [editRequest])

  const startEdit = (key: string, name: string) => {
    setEditing(key)
    setDraft(name)
  }
  const cancelEdit = () => {
    setEditing(null)
    onEditDone?.()
  }
  const commit = (kind: 'folder' | 'doc', id: string | null) => {
    const name = draft.trim()
    setEditing(null)
    onEditDone?.()
    if (!name || !id) return
    if (kind === 'folder') onRenameFolder(id, name)
    else onRenameDoc(id, name)
  }

  const nameInput = (kind: 'folder' | 'doc', id: string | null) => (
    <input
      ref={inputRef}
      className="tree-edit"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(kind, id)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // 阻止冒泡到行的 keydown（否则回车保存后又被当作「进入编辑」）。
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(kind, id)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelEdit()
        }
      }}
    />
  )

  // 选中行按 Enter / F2 进入改名（编辑中不响应，交给输入框处理）。
  const renameKey = (e: React.KeyboardEvent, editKey: string, name: string, allowed: boolean) => {
    if (editing) return
    if (allowed && (e.key === 'Enter' || e.key === 'F2')) {
      e.preventDefault()
      startEdit(editKey, name)
    }
  }

  const renderFolder = (node: FolderNode, depth: number) => {
    const key = keyOf(node.folderId)
    const isOpen = !!expanded[key]
    const editKey = `f:${key}`
    const hasChildren = node.children.length > 0
    const active = selectedFolderId === node.folderId && openDocId === null
    return (
      <li key={key}>
        <div
          className={`tree-row${active ? ' active' : ''}${dropKey === key ? ' drop-target' : ''}`}
          style={{ paddingLeft: depth * 14 + 8 }}
          tabIndex={0}
          onClick={() => {
            onToggle(key)
            onSelectFolder(node.folderId)
          }}
          onKeyDown={(e) => renameKey(e, editKey, node.name, !node.isDefault)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onContextMenu?.(
              { kind: 'folder', folderId: node.folderId, name: node.name, isDefault: node.isDefault },
              e.clientX,
              e.clientY
            )
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDropKey(key)
          }}
          onDragLeave={() => setDropKey((k) => (k === key ? null : k))}
          onDrop={(e) => {
            e.preventDefault()
            setDropKey(null)
            const id = e.dataTransfer.getData('text/doc-id')
            if (id) onMoveDoc(id, node.folderId)
          }}
        >
          <span className="tree-arrow">{hasChildren ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className="tree-icon folder" aria-hidden="true" />
          {editing === editKey ? (
            nameInput('folder', node.folderId)
          ) : (
            <span
              className="tree-name"
              onDoubleClick={
                node.isDefault
                  ? undefined
                  : (e) => {
                      e.stopPropagation()
                      startEdit(editKey, node.name)
                    }
              }
            >
              {node.name}
            </span>
          )}
          <span className="tree-count">({node.docCount})</span>
        </div>
        {isOpen && hasChildren && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    )
  }

  const renderDoc = (node: DocNode, depth: number) => {
    const editKey = `d:${node.id}`
    return (
      <li key={node.id}>
        <div
          className={`tree-row doc${openDocId === node.id ? ' active' : ''}`}
          style={{ paddingLeft: depth * 14 + 8 }}
          tabIndex={0}
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/doc-id', node.id)}
          onClick={() => onOpenDoc(node.id)}
          onKeyDown={(e) => renameKey(e, editKey, node.name, true)}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onContextMenu?.({ kind: 'doc', id: node.id, name: node.name }, e.clientX, e.clientY)
          }}
        >
          <span className="tree-arrow" />
          <span className="tree-icon doc" data-type={node.docType} aria-hidden="true" />
          {editing === editKey ? (
            nameInput('doc', node.id)
          ) : (
            <span
              className="tree-name"
              onDoubleClick={(e) => {
                e.stopPropagation()
                startEdit(editKey, node.name)
              }}
            >
              {node.name}
            </span>
          )}
        </div>
      </li>
    )
  }

  const renderNode = (node: FileNode, depth: number) =>
    node.kind === 'folder' ? renderFolder(node, depth) : renderDoc(node, depth)

  return (
    <ul
      className="file-tree"
      onContextMenu={(e) => {
        // 仅空白处（子行已 stopPropagation）触发创建菜单。
        e.preventDefault()
        onBackgroundContextMenu?.(e.clientX, e.clientY)
      }}
    >
      {nodes.map((n) => renderNode(n, 0))}
    </ul>
  )
}
