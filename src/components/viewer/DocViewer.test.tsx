import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DocViewer } from './DocViewer'

afterEach(cleanup)

describe('DocViewer', () => {
  it('renders markdown content', () => {
    render(<DocViewer doc={{ type: 'md', name: 'a', contentText: '# Hello\n\nworld', fileUrl: null }} />)
    expect(screen.getByText('Hello')).toBeTruthy()
    expect(screen.getByText('world')).toBeTruthy()
  })

  it('renders raw HTML tables embedded in markdown (rehype-raw)', () => {
    const md = '前言\n\n<table><tr><td>A</td><td>B</td></tr></table>'
    render(<DocViewer doc={{ type: 'md', name: 'a', contentText: md, fileUrl: null }} />)
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    expect(document.querySelector('table')).not.toBeNull()
  })

  it('renders plain txt content', () => {
    render(<DocViewer doc={{ type: 'txt', name: 'a', contentText: 'plain text here', fileUrl: null }} />)
    expect(screen.getByText('plain text here')).toBeTruthy()
  })

  it('renders pdf via an iframe with the file url', () => {
    render(<DocViewer doc={{ type: 'pdf', name: 'a', contentText: '', fileUrl: 'file:///x.pdf' }} />)
    const frame = screen.getByTitle('pdf') as HTMLIFrameElement
    expect(frame.getAttribute('src')).toBe('file:///x.pdf')
  })
})
