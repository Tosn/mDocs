import type { TreeNode } from '@shared/types'

interface FolderTreeProps {
  nodes: TreeNode[]
  expanded: Record<string, boolean>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

function TreeRow({ node, expanded, onToggle, onSelect, onDelete }: { node: TreeNode } & Omit<FolderTreeProps, 'nodes'>) {
  const isExpanded = !!expanded[node.id]
  const hasChildren = node.children.length > 0
  return (
    <li>
      <div className="tree-row">
        {hasChildren && (
          <button aria-label={`展开 ${node.name}`} onClick={() => onToggle(node.id)}>
            {isExpanded ? '▾' : '▸'}
          </button>
        )}
        <span className="tree-name" onClick={() => onSelect(node.id)}>
          {node.name}
        </span>
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
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function FolderTree({ nodes, expanded, onToggle, onSelect, onDelete }: FolderTreeProps) {
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
        />
      ))}
    </ul>
  )
}
