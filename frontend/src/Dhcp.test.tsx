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
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = (init?.method || 'GET').toUpperCase()
        if (url.includes('/dhcp/local/enable') && method === 'POST') {
          return new Response(
            JSON.stringify({
              enabled: true,
              running: true,
              server_id: 1,
              pools: 1,
              reservations: 0,
              leases: 0,
              detail: 'Local DHCP is enabled and the sidecar is watching the config.',
              warning: 'Turn off DHCP on the Wi-Fi router first.',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.includes('/dhcp/local/disable') && method === 'POST') {
          return new Response(
            JSON.stringify({
              enabled: false,
              running: false,
              server_id: 1,
              pools: 1,
              reservations: 0,
              leases: 0,
              detail: 'Local DHCP is disabled. The router can keep serving leases.',
              warning: 'Turn off DHCP on the Wi-Fi router first.',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.includes('/dhcp/router/fetch') && method === 'POST') {
          return new Response(
            JSON.stringify({
              router_type: 'paste',
              added: 2,
              updated: 0,
              total: 2,
              server_id: 4,
              pool_id: 2,
              message: 'Imported 2 leases from paste.',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
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

    vi.stubGlobal('confirm', vi.fn(() => true))
    const enable = Array.from(container.querySelectorAll('button')).find((el) => el.textContent === 'Enable local DHCP')
    expect(enable).toBeTruthy()
    await act(async () => {
      enable!.click()
    })
    expect(container.textContent).toContain('Enabled')

    const form = container.querySelector('form')
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(form).toBeTruthy()
    expect(textarea).toBeTruthy()
    await act(async () => {
      textarea.value = '192.168.1.55 aa:bb:cc:dd:ee:99 camera'
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(container.textContent).toContain('Imported 2 leases from paste.')
  })
})
