import { useState } from 'react'
import type { SearchHit } from '@shared/types'

interface SearchPanelProps {
  onSearch: (query: string) => Promise<SearchHit[]>
  onOpenHit: (hit: SearchHit) => void
}

export function SearchPanel({ onSearch, onOpenHit }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searched, setSearched] = useState(false)

  const run = async () => {
    const q = query.trim()
    if (!q) return
    const results = await onSearch(q)
    setHits(results)
    setSearched(true)
  }

  return (
    <div className="search-panel">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <input
          type="text"
          placeholder="搜索文件名或内容"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">搜索</button>
      </form>

      {searched && hits.length === 0 && <p className="empty">未找到相关结果</p>}

      <ul className="results">
        {hits.map((h) => (
          <li key={h.documentId} onClick={() => onOpenHit(h)}>
            <span className="name">{h.name}</span>
            <span className="snippet">{h.snippet}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
