import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DhcpPanel } from './Dhcp'

describe('DHCP panel', () => {
  let container: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/dhcp/local/status')) {
          return new Response(
            JSON.stringify({
              enabled: false,
              running: false,
              server_id: 1,
              pools: 0,
              reservations: 0,
              leases: 0,
              detail: 'Local DHCP is disabled.',
              warning: 'Turn off DHCP on the Wi-Fi router first.',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.includes('/dhcp/servers') || url.includes('/dhcp/leases')) {
          return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response('{}', { status: 404 })
      }),
    )
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
    vi.unstubAllGlobals()
  })

  it('shows local enable/disable and router fetch', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root!.render(<DhcpPanel />)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Local DHCP server')
    expect(container.textContent).toContain('Enable local DHCP')
    expect(container.textContent).toContain('Fetch router DHCP table')
    expect(container.textContent).toContain('OpenWrt')
    expect(container.textContent).toContain('Disabled')
  })
})
