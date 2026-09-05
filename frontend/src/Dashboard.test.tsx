import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from './Dashboard'

const stats = {
  auth: { total_users: 1, active_users: 1, total_roles: 3, total_permissions: 8, active_tokens: 0 },
  ipam: { total_vlans: 1, total_subnets: 2, assigned_ips: 4, total_ips: 10 },
  inventory: { total_hosts: 3, active_hosts: 2, unknown_hosts: 0 },
  dns: { total_zones: 1, forward_zones: 1, total_records: 6 },
  dhcp: { total_servers: 0, total_pools: 0, active_leases: 0, total_reservations: 0 },
  pki: { total_cas: 1, total_certs: 2, active_certs: 2, expiring_30d: 1 },
  smtp: { listening: false, relays: 1 },
  cloudflare: { accounts: 0 },
  attention: { expiring_certs: 1, failed_audit: 0 },
  audit: [{ id: 9, action: 'LOGIN', resource: 'auth', success: true, created_at: '2026-09-05T12:00:00Z' }],
}

const services = [
  {
    id: 'postgres',
    name: 'PostgreSQL',
    role: 'database',
    kind: 'container',
    status: 'running',
    health: 'healthy',
    detail: 'Up 2 hours (healthy)',
    controllable: true,
    docker_available: true,
    container: 'nexusops-postgres',
  },
  {
    id: 'smtp',
    name: 'SMTP listener',
    role: 'mail',
    kind: 'process',
    status: 'stopped',
    health: 'down',
    detail: 'Listener is off',
    controllable: true,
    docker_available: true,
    container: null,
  },
]

describe('Dashboard', () => {
  let container: HTMLDivElement | null = null
  let root: ReturnType<typeof createRoot> | null = null

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/dashboard/stats')) {
          return new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (url.includes('/platform/services/smtp/start')) {
          return new Response(JSON.stringify({ id: 'smtp', action: 'start', status: 'running', message: 'SMTP listener is running' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/platform/services')) {
          return new Response(JSON.stringify(services), { status: 200, headers: { 'Content-Type': 'application/json' } })
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

  it('shows services, attention, and start/stop/restart actions', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <Dashboard userName="admin" />
        </MemoryRouter>,
      )
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Platform services')
    expect(container.textContent).toContain('PostgreSQL')
    expect(container.textContent).toContain('SMTP listener')
    expect(container.textContent).toContain('Start')
    expect(container.textContent).toContain('Stop')
    expect(container.textContent).toContain('Restart')
    expect(container.textContent).toContain('Needs attention')
    expect(container.textContent).toContain('expire within 30 days')
    expect(container.textContent).toContain('SMTP listener is off')
    expect(container.textContent).toContain('Recent activity')
    expect(container.textContent).toContain('LOGIN')

    const startButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === 'Start')
    const smtpStart = startButtons.find((button) => !button.disabled)
    expect(smtpStart).toBeTruthy()

    await act(async () => {
      smtpStart!.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('SMTP listener is running')
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]))
    expect(calls.some((url) => url.includes('/platform/services/smtp/start'))).toBe(true)
  })
})
