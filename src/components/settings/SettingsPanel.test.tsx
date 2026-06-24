import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'

afterEach(cleanup)

const models = [
  { id: 'openai:gpt-4o', label: 'GPT-4o', provider: 'openai', modelName: 'gpt-4o', kind: 'chat' as const }
]

describe('SettingsPanel', () => {
  it('lists models and selecting one calls onSelectModel', () => {
    const onSelectModel = vi.fn()
    render(
      <SettingsPanel
        models={models}
        currentModelId={null}
        onSelectModel={onSelectModel}
        onSaveKey={vi.fn()}
        needKey
        maskedKey={null}
        privacyNotice="notice text"
      />
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'openai:gpt-4o' } })
    expect(onSelectModel).toHaveBeenCalledWith('openai:gpt-4o')
  })

  it('prefills the masked key and saves a new one', () => {
    const onSaveKey = vi.fn()
    render(
      <SettingsPanel
        models={models}
        currentModelId="openai:gpt-4o"
        onSelectModel={vi.fn()}
        onSaveKey={onSaveKey}
        needKey
        maskedKey="sk-...1234"
        privacyNotice="notice text"
      />
    )
    const input = screen.getByPlaceholderText(/API Key/) as HTMLInputElement
    expect(input.value).toBe('sk-...1234')
    fireEvent.change(input, { target: { value: 'sk-new-key' } })
    fireEvent.click(screen.getByText('保存'))
    expect(onSaveKey).toHaveBeenCalledWith('sk-new-key')
  })

  it('shows the privacy notice', () => {
    render(
      <SettingsPanel
        models={models}
        currentModelId={null}
        onSelectModel={vi.fn()}
        onSaveKey={vi.fn()}
        needKey={false}
        maskedKey={null}
        privacyNotice="notice text"
      />
    )
    expect(screen.getByText('notice text')).toBeTruthy()
  })
})
