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

  it('switches between light and dark and persists the choice', () => {
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

    const button = container.querySelector('button[aria-label="Switch to dark theme"]')
    expect(button).not.toBeNull()

    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(container.querySelector('button[aria-label="Switch to light theme"]')).not.toBeNull()
  })
})
