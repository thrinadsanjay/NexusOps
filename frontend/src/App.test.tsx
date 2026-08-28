import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import App from './App'

describe('NexusOps app shell', () => {
  let container: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null

  afterEach(() => {
    if (root) {
      const current = root
      act(() => {
        current.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
  })

  it('shows the login experience for unauthenticated users', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Welcome back')
    expect(container.querySelector('input[name="username"]')).not.toBeNull()
    expect(container.querySelector('input[name="password"]')).not.toBeNull()
  })
})
