import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { Sidebar, currentPageLabel, navSections } from './Sidebar'

describe('enterprise navigation', () => {
  it('groups routes by operations, infrastructure, identity, and platform', () => {
    const titles = navSections.map((section) => section.title)
    expect(titles).toEqual(['Operations', 'Infrastructure', 'Identity & security', 'Platform'])
    const labels = navSections.flatMap((section) => section.items.map((item) => item.label))
    expect(labels).toContain('Network')
    expect(labels).toContain('Directory')
    expect(labels).toContain('Integrations')
    expect(labels).toContain('Mail')
  })

  it('labels nested infrastructure pages for the top bar', () => {
    expect(currentPageLabel('/')).toBe('Overview')
    expect(currentPageLabel('/ipam/vlans')).toBe('VLANs')
    expect(currentPageLabel('/inventory/groups')).toBe('Groups')
    expect(currentPageLabel('/tools')).toBe('Integrations')
  })
})

describe('Sidebar', () => {
  let container: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
  })

  it('renders grouped links and the signed-in user', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root!.render(
        <MemoryRouter initialEntries={['/tools']}>
          <Sidebar
            userName="admin"
            userRole="Administrator"
            onLogout={() => undefined}
            mobileOpen
            onCloseMobile={() => undefined}
          />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Infrastructure')
    expect(container.textContent).toContain('Identity & security')
    expect(container.textContent).toContain('admin')
    expect(container.textContent).toContain('Integrations')
  })
})
