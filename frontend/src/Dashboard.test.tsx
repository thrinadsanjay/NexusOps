import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from './Dashboard'

const stats = {
  auth: { total_users: 2, active_users: 1, total_roles: 3, total_permissions: 8, active_tokens: 0 },
  ipam: { total_vlans: 1, total_subnets: 1, assigned_ips: 5, available_ips: 0, reserved_ips: 0, other_ips: 0, total_ips: 5 },
  inventory: { total_hosts: 5, active_hosts: 5, unknown_hosts: 0, total_groups: 1, hosts_30d: 2 },
  dns: {
    total_zones: 1,
    forward_zones: 1,
    total_records: 34,
    zones: [{ id: 1, name: 'local', kind: 'forward', status: 'active', records: 34 }],
  },
  dhcp: { total_servers: 1, total_pools: 1, active_leases: 0, total_reservations: 0 },
  pki: { total_cas: 1, total_certs: 1, active_certs: 1, expiring_30d: 0, expired: 0 },
  smtp: { listening: false, relays: 1 },
  cloudflare: { accounts: 0 },
  attention: { expiring_certs: 0, failed_audit: 0 },
  audit: [{ id: 9, action: 'USER_LOGIN', resource: 'auth', success: true, created_at: '2026-09-05T12:00:00Z' }],
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

  it('renders the enterprise overview and service controls', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(
        <MemoryRouter>
          <Dashboard userName="Local Administrator" />
        </MemoryRouter>,
      )
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Welcome back, Local Administrator')
    expect(container.textContent).toContain('Hosts')
    expect(container.textContent).toContain('Subnets')
    expect(container.textContent).toContain('DNS Records')
    expect(container.textContent).toContain('DHCP Leases')
    expect(container.textContent).toContain('IP Address Utilization')
    expect(container.textContent).toContain('DNS Zones')
    expect(container.textContent).toContain('local')
    expect(container.textContent).toContain('System Status')
    expect(container.textContent).toContain('PostgreSQL')
    expect(container.textContent).toContain('SMTP listener')
    expect(container.textContent).toContain('Start')
    expect(container.textContent).toContain('Stop')
    expect(container.textContent).toContain('Restart')
    expect(container.textContent).toContain('Recent Activity')
    expect(container.textContent).toContain('User Login')
    expect(container.textContent).toContain('Quick Action')

    const smtpStart = container.querySelector('button[data-service-id="smtp"][data-action="start"]') as HTMLButtonElement | null
    const smtpStop = container.querySelector('button[data-service-id="smtp"][data-action="stop"]') as HTMLButtonElement | null
    const postgresStart = container.querySelector('button[data-service-id="postgres"][data-action="start"]') as HTMLButtonElement | null
    expect(smtpStart?.disabled).toBe(false)
    expect(smtpStop?.disabled).toBe(true)
    expect(postgresStart?.disabled).toBe(true)

    await act(async () => {
      smtpStart!.click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('SMTP listener is running')
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]))
    expect(calls.some((url) => url.includes('/platform/services/smtp/start'))).toBe(true)
  })
})
