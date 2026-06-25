import { useState } from 'react'
import type { TreeNode } from '@shared/types'

interface FolderTreeProps {
  nodes: TreeNode[]
  expanded: Record<string, boolean>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename?: (id: string, currentName: string) => void
  /** 拖拽文档到该文件夹时触发（移动文档）。 */
  onMoveDoc?: (docId: string, folderId: string | null) => void
  selectedId?: string | null
}

function TreeRow({
  node,
  expanded,
  onToggle,
  onSelect,
  onDelete,
  onRename,
  onMoveDoc,
  selectedId
}: { node: TreeNode } & Omit<FolderTreeProps, 'nodes'>) {
  const isExpanded = !!expanded[node.id]
  const hasChildren = node.children.length > 0
  const [dropActive, setDropActive] = useState(false)

  return (
    <li>
      <div
        className={`tree-row${node.id === selectedId ? ' active' : ''}${dropActive ? ' drop-target' : ''}`}
        onDragOver={
          onMoveDoc
            ? (e) => {
                e.preventDefault()
                setDropActive(true)
              }
            : undefined
        }
        onDragLeave={onMoveDoc ? () => setDropActive(false) : undefined}
        onDrop={
          onMoveDoc
            ? (e) => {
                e.preventDefault()
                setDropActive(false)
                const docId = e.dataTransfer.getData('text/doc-id')
                if (docId) onMoveDoc(docId, node.id)
              }
            : undefined
        }
      >
        {hasChildren && (
          <button aria-label={`展开 ${node.name}`} onClick={() => onToggle(node.id)}>
            {isExpanded ? '▾' : '▸'}
          </button>
        )}
        <span className="tree-name" onClick={() => onSelect(node.id)}>
          {node.name}
        </span>
        <span className="tree-count">({node.docCount})</span>
        {onRename && (
          <button aria-label={`重命名 ${node.name}`} onClick={() => onRename(node.id, node.name)}>
            改名
          </button>
        )}
        <button
          aria-label={`删除 ${node.name}`}
          onClick={() => {
            if (window.confirm(`确认删除「${node.name}」及其全部内容？删除后可在回收站保留 7 天。`)) {
              onDelete(node.id)
            }
          }}
        >
          删除
        </button>
      </div>
      {hasChildren && isExpanded && (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
              onMoveDoc={onMoveDoc}
              selectedId={selectedId}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function FolderTree({
  nodes,
  expanded,
  onToggle,
  onSelect,
  onDelete,
  onRename,
  onMoveDoc,
  selectedId
}: FolderTreeProps) {
  return (
    <ul className="folder-tree">
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
          onMoveDoc={onMoveDoc}
          selectedId={selectedId}
        />
      ))}
    </ul>
  )
}
