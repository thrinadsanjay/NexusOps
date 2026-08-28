import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { THEME_STORAGE_KEY, ThemeProvider, ThemeToggle } from './theme'

describe('theme toggle', () => {
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
    localStorage.removeItem(THEME_STORAGE_KEY)
    document.documentElement.classList.remove('dark', 'light')
  })

  it('switches between light, dark, and system and persists the choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>,
      )
    })

    const dark = container.querySelector('button[aria-label="Use dark theme"]')
    expect(dark).not.toBeNull()
    expect(container.querySelector('button[aria-label="Use light theme"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Use system theme"]')).not.toBeNull()

    act(() => {
      dark!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(container.querySelector('button[aria-label="Use dark theme"]')?.getAttribute('aria-checked')).toBe('true')

    const system = container.querySelector('button[aria-label="Use system theme"]')
    act(() => {
      system!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })
})
