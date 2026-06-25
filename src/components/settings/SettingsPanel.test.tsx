import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import { SettingsPanel } from './SettingsPanel'

afterEach(cleanup)

const models = [
  { id: 'openai:gpt-4o', label: 'GPT-4o', provider: 'openai', modelName: 'gpt-4o', kind: 'chat' as const },
  {
    id: 'openai:text-embedding-3-small',
    label: 'OpenAI Embedding 3 Small',
    provider: 'openai',
    modelName: 'text-embedding-3-small',
    kind: 'embedding' as const
  }
]

const baseProps = {
  models,
  currentModelId: null,
  needKey: false,
  maskedKey: null,
  onSelectModel: vi.fn(),
  onSaveKey: vi.fn(),
  currentEmbedId: null,
  embedNeedKey: false,
  embedMaskedKey: null,
  onSelectEmbed: vi.fn(),
  onSaveEmbedKey: vi.fn(),
  privacyNotice: 'notice text'
}

const chat = () => screen.getByTestId('model-section-chat')
const embed = () => screen.getByTestId('model-section-embed')

describe('SettingsPanel', () => {
  it('renders separate chat and embedding sections', () => {
    render(<SettingsPanel {...baseProps} />)
    expect(within(chat()).getByText('对话模型')).toBeTruthy()
    expect(within(embed()).getByText(/用于文档检索/)).toBeTruthy()
  })

  it('chat section lists only chat models; embedding section only embedding models', () => {
    render(<SettingsPanel {...baseProps} />)
    expect(within(chat()).getByRole('option', { name: 'GPT-4o' })).toBeTruthy()
    expect(within(chat()).queryByRole('option', { name: 'OpenAI Embedding 3 Small' })).toBeNull()
    expect(within(embed()).getByRole('option', { name: 'OpenAI Embedding 3 Small' })).toBeTruthy()
    expect(within(embed()).queryByRole('option', { name: 'GPT-4o' })).toBeNull()
  })

  it('selecting a chat model calls onSelectModel', () => {
    const onSelectModel = vi.fn()
    render(<SettingsPanel {...baseProps} needKey onSelectModel={onSelectModel} />)
    fireEvent.change(within(chat()).getByRole('combobox'), { target: { value: 'openai:gpt-4o' } })
    expect(onSelectModel).toHaveBeenCalledWith('openai:gpt-4o')
  })

  it('selecting an embedding model calls onSelectEmbed', () => {
    const onSelectEmbed = vi.fn()
    render(<SettingsPanel {...baseProps} embedNeedKey onSelectEmbed={onSelectEmbed} />)
    fireEvent.change(within(embed()).getByRole('combobox'), {
      target: { value: 'openai:text-embedding-3-small' }
    })
    expect(onSelectEmbed).toHaveBeenCalledWith('openai:text-embedding-3-small')
  })

  it('prefills the masked key and saves a new one (chat section)', () => {
    const onSaveKey = vi.fn()
    render(
      <SettingsPanel
        {...baseProps}
        currentModelId="openai:gpt-4o"
        needKey
        maskedKey="sk-...1234"
        onSaveKey={onSaveKey}
      />
    )
    const input = within(chat()).getByPlaceholderText(/API Key/) as HTMLInputElement
    expect(input.value).toBe('sk-...1234')
    fireEvent.change(input, { target: { value: 'sk-new-key' } })
    fireEvent.click(within(chat()).getByText('保存'))
    expect(onSaveKey).toHaveBeenCalledWith('sk-new-key')
  })

  it('shows the privacy notice', () => {
    render(<SettingsPanel {...baseProps} />)
    expect(screen.getByText('notice text')).toBeTruthy()
  })
})
