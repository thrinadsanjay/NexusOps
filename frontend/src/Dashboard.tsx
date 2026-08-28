import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiFetch } from './api/client'
import { NAV_GROUPS } from './layout/navigation'
import { RelativeTime } from './ui/time'

type AuthUser = {
  email: string
  username: string
  full_name?: string | null
}

type Stats = {
  auth: { total_users: number; active_users: number; total_roles: number; total_permissions: number; active_tokens: number }
  ipam: { total_vlans: number; total_subnets: number; assigned_ips: number; total_ips: number }
  inventory: { total_hosts: number; active_hosts: number; unknown_hosts: number }
  dns: { total_zones: number; forward_zones: number; total_records: number }
  dhcp: { total_servers: number; total_pools: number; active_leases: number; total_reservations: number }
  pki?: { total_cas: number; total_certs: number; active_certs: number; expiring_30d: number }
  ldap?: { total_servers: number; last_ok: number }
  health?: { api: string; database: string }
  audit: { id: number; action: string; resource: string; success: boolean; created_at: string }[]
}

type Attention = { id: string; title: string; detail: string; to: string; tone: 'danger' | 'warn' }

const GROUP_STATS: Record<string, (stats: Stats) => string> = {
  network: (stats) => `${stats.ipam.total_subnets} subnets · ${stats.dns.total_zones} DNS zones · ${stats.dhcp.active_leases} leases`,
  inventory: (stats) => `${stats.inventory.active_hosts} active of ${stats.inventory.total_hosts} hosts`,
  identity: (stats) => `${stats.auth.active_users} users · ${stats.ldap?.total_servers ?? 0} directories`,
  security: (stats) => `${stats.pki?.active_certs ?? 0} active certs · ${stats.pki?.expiring_30d ?? 0} expiring`,
  operations: (stats) => `${stats.auth.active_tokens} API tokens`,
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function attentionItems(stats: Stats): Attention[] {
  const items: Attention[] = []
  if (stats.health?.database === 'error') {
    items.push({ id: 'db', title: 'Database unavailable', detail: 'Health check failed. Writes and lists may be stale.', to: '/', tone: 'danger' })
  }
  if ((stats.pki?.expiring_30d ?? 0) > 0) {
    items.push({
      id: 'certs',
      title: `${stats.pki!.expiring_30d} certificates expire within 30 days`,
      detail: 'Open PKI with the 30-day filter applied.',
      to: '/pki?expiry=30',
      tone: 'warn',
    })
  }
  if (stats.inventory.unknown_hosts > 0) {
    items.push({
      id: 'unknown',
      title: `${stats.inventory.unknown_hosts} unknown hosts`,
      detail: 'Review discovered devices that still need a role or status.',
      to: '/inventory?status=unknown',
      tone: 'warn',
    })
  }
  const failed = stats.audit.filter((item) => !item.success)
  if (failed.length > 0) {
    items.push({
      id: 'audit',
      title: `${failed.length} failed audit events in the latest feed`,
      detail: failed[0].action,
      to: '/settings?tab=audit&success=false',
      tone: 'danger',
    })
  }
  if ((stats.ldap?.total_servers ?? 0) > (stats.ldap?.last_ok ?? 0)) {
    items.push({
      id: 'ldap',
      title: 'A directory last tested unhealthy',
      detail: `${stats.ldap?.last_ok ?? 0} of ${stats.ldap?.total_servers ?? 0} directories reported ok.`,
      to: '/ldap',
      tone: 'warn',
    })
  }
  return items
}

export function Dashboard({
  user,
  canAccess,
}: {
  user: AuthUser
  canAccess: (permission: string | null) => boolean
}) {
  const name = user.full_name || user.username || 'Operator'
  const greeting = useMemo(() => greetingForHour(new Date().getHours()), [])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loadError, setLoadError] = useState('')

  const loadStats = useCallback(() => {
    setLoadError('')
    apiFetch('/api/v1/dashboard/stats')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load dashboard stats')
        }
        return response.json()
      })
      .then(setStats)
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Unable to load dashboard stats'))
  }, [])

  useEffect(() => {
    loadStats()
    const id = window.setInterval(loadStats, 30000)
    return () => window.clearInterval(id)
  }, [loadStats])

  const groups = useMemo(
    () =>
      NAV_GROUPS.filter((group) => group.id !== 'overview')
        .map((group) => ({ ...group, items: group.items.filter((item) => canAccess(item.permission)) }))
        .filter((group) => group.items.length > 0),
    [canAccess],
  )

  const kpis = stats
    ? [
        {
          label: 'Hosts',
          value: stats.inventory.total_hosts,
          sub: `${stats.inventory.active_hosts} active`,
          to: '/inventory',
          emptyTo: '/inventory',
          emptyLabel: 'Add a host',
        },
        {
          label: 'Subnets',
          value: stats.ipam.total_subnets,
          sub: `${stats.ipam.assigned_ips} IPs assigned`,
          to: '/ipam/subnets',
          emptyTo: '/ipam',
          emptyLabel: 'Add a subnet',
        },
        {
          label: 'DNS records',
          value: stats.dns.total_records,
          sub: `${stats.dns.total_zones} zones`,
          to: '/dns',
          emptyTo: '/dns',
          emptyLabel: 'Add a zone',
        },
        {
          label: 'DHCP leases',
          value: stats.dhcp.active_leases,
          sub: `${stats.dhcp.total_reservations} static`,
          to: '/dhcp',
          emptyTo: '/dhcp',
          emptyLabel: 'Open DHCP',
        },
      ]
    : []

  const databaseError = stats?.health?.database === 'error'
  const healthLabel = databaseError ? 'Database unavailable' : stats ? 'API healthy' : 'Checking health…'
  const alerts = stats ? attentionItems(stats) : []

  return (
    <section className="space-y-8">
      <div className="nx-card overflow-hidden">
        <div className="border-b border-line bg-accent-soft/70 px-6 py-6 md:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="nx-kicker">Overview</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
                {greeting}, {name}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                Control-plane snapshot of registries, inventory, identity, and certificates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  databaseError || loadError ? 'border-danger/30 bg-danger/10 text-danger' : 'border-ok/30 bg-ok/10 text-ok'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${databaseError || loadError ? 'bg-danger' : 'animate-pulse bg-ok'}`} />
                {loadError || healthLabel}
              </div>
              <button type="button" onClick={loadStats} className="nx-btn-ghost px-3 py-1.5 text-xs">
                Refresh
              </button>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="border-b border-danger/30 bg-danger/10 px-6 py-3 text-sm text-danger">
            {loadError}. <button type="button" className="underline" onClick={loadStats}>Retry</button>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="border-b border-line bg-surface px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">Needs attention</p>
            <ul className="mt-3 space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <Link
                    to={alert.to}
                    className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                      alert.tone === 'danger' ? 'border-danger/30 bg-danger/10' : 'border-warn/30 bg-warn/10'
                    }`}
                  >
                    <span>
                      <span className={`block text-sm font-medium ${alert.tone === 'danger' ? 'text-danger' : 'text-warn'}`}>{alert.title}</span>
                      <span className="block text-xs text-muted">{alert.detail}</span>
                    </span>
                    <span className="text-xs text-faint">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          {stats === null
            ? [0, 1, 2, 3].map((index) => <div key={index} className="h-28 animate-pulse bg-surface" />)
            : kpis.map((kpi) => (
                <Link key={kpi.label} to={kpi.value === 0 ? kpi.emptyTo : kpi.to} className="bg-surface px-6 py-5 transition hover:bg-accent-soft/50">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">{kpi.label}</p>
                  {kpi.value === 0 ? (
                    <>
                      <p className="mt-2 text-lg font-semibold text-ink">{kpi.emptyLabel}</p>
                      <p className="mt-1 text-xs text-muted">Nothing registered yet</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{kpi.value}</p>
                      <p className="mt-1 text-xs text-muted">{kpi.sub}</p>
                    </>
                  )}
                </Link>
              ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`dash-${group.id}`}>
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 id={`dash-${group.id}`} className="text-sm font-semibold text-ink">
                  {group.label}
                </h2>
                {stats && GROUP_STATS[group.id] && <p className="text-xs text-muted">{GROUP_STATS[group.id](stats)}</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-accent/40 hover:bg-accent-soft/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-ink">{item.label}</h3>
                      <span className="text-xs text-faint transition group-hover:text-accent" aria-hidden="true">
                        →
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-muted">{item.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="nx-card h-fit p-5" aria-labelledby="recent-activity-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="recent-activity-heading" className="text-sm font-semibold text-ink">
              Recent activity
            </h2>
            <Link to="/settings?tab=audit" className="text-xs font-medium text-muted transition hover:text-accent">
              View all
            </Link>
          </div>
          <ol className="space-y-3">
            {!stats || stats.audit.length === 0 ? (
              <li className="text-sm text-muted">No activity yet.</li>
            ) : (
              stats.audit.map((log) => (
                <li key={log.id} className="relative border-l border-line pl-4">
                  <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${log.success ? 'bg-ok' : 'bg-danger'}`} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{log.action}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${log.success ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger'}`}>
                      {log.success ? 'ok' : 'fail'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{log.resource}</p>
                  <RelativeTime value={log.created_at} className="mt-1 block text-[11px] text-faint" />
                </li>
              ))
            )}
          </ol>
        </aside>
      </div>
    </section>
  )
}
