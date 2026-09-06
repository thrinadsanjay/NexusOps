import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from './apiBase'
import { Alert, Badge, btnGhost } from './ui'

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('nexusops_token') ?? ''}`, 'Content-Type': 'application/json' }
}

function actionError(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: unknown }).msg)
        return ''
      })
      .filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  return fallback
}

type AuditItem = { id: number; action: string; resource: string; success: boolean; created_at: string }
type DnsZoneRow = { id: number; name: string; kind: string; status: string; records: number }

type Stats = {
  auth: { total_users: number; active_users: number; total_roles: number; total_permissions: number; active_tokens: number }
  ipam: {
    total_vlans: number
    total_subnets: number
    assigned_ips: number
    total_ips: number
    available_ips?: number
    reserved_ips?: number
    other_ips?: number
  }
  inventory: { total_hosts: number; active_hosts: number; unknown_hosts: number; total_groups?: number; hosts_30d?: number }
  dns: { total_zones: number; forward_zones: number; total_records: number; zones?: DnsZoneRow[] }
  dhcp: { total_servers: number; total_pools: number; active_leases: number; total_reservations: number }
  pki?: { total_cas: number; total_certs: number; active_certs: number; expiring_30d: number; expired?: number }
  smtp?: { listening: boolean; relays: number }
  cloudflare?: { accounts: number }
  attention?: { expiring_certs: number; failed_audit: number }
  audit: AuditItem[]
}

export type PlatformService = {
  id: string
  name: string
  role: string
  kind: string
  status: string
  health: string
  detail: string
  controllable: boolean
  docker_available: boolean
  container: string | null
  started_at?: string | null
}

const CRITICAL = new Set(['backend', 'postgres', 'frontend'])
const QUICK_ACTIONS = [
  { label: 'Add host', to: '/inventory' },
  { label: 'Add subnet', to: '/ipam/subnets' },
  { label: 'Add DNS record', to: '/dns' },
  { label: 'Issue certificate', to: '/pki' },
  { label: 'Mail settings', to: '/smtp' },
] as const

const card = 'rounded-2xl border border-white/10 bg-[#121a27] p-5'
const linkBtn = 'mt-4 inline-flex items-center text-sm font-medium text-indigo-300 hover:text-indigo-200'

function healthTone(health: string, status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'restarting' || health === 'starting') return 'warning'
  if (health === 'healthy' || health === 'up' || status === 'running') return 'success'
  if (health === 'unhealthy' || status === 'stopped') return 'danger'
  return 'neutral'
}

function healthLabel(service: PlatformService): string {
  if (service.status === 'restarting') return 'Restarting'
  if (service.health === 'healthy' || (service.status === 'running' && service.health !== 'unhealthy')) return 'Operational'
  if (service.health === 'unhealthy') return 'Unhealthy'
  if (service.status === 'stopped') return 'Stopped'
  return 'Unknown'
}

function sparkPoints(seed: number): number[] {
  return Array.from({ length: 12 }, (_, i) => Math.max(1, Math.round(seed * 0.45 + ((seed * 17 + i * 13) % 9))))
}

function Sparkline({ seed, color }: { seed: number; color: string }) {
  const points = sparkPoints(Math.max(seed, 1))
  const max = Math.max(...points)
  const min = Math.min(...points)
  const w = 88
  const h = 32
  const d = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * w
      const y = h - 3 - ((value - min) / (max - min || 1)) * (h - 6)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Donut({
  segments,
  total,
  label,
}: {
  segments: { value: number; color: string }[]
  total: number
  label: string
}) {
  const r = 38
  const c = 2 * Math.PI * r
  const safeTotal = total || segments.reduce((sum, item) => sum + item.value, 0) || 1
  let offset = 0
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="14" />
      {segments
        .filter((item) => item.value > 0)
        .map((item) => {
          const len = (item.value / safeTotal) * c
          const dash = `${len} ${c - len}`
          const el = (
            <circle
              key={item.color}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={item.color}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
          )
          offset += len
          return el
        })}
      <text x="60" y="56" textAnchor="middle" className="fill-white" fontSize="18" fontWeight="600">
        {total}
      </text>
      <text x="60" y="74" textAnchor="middle" className="fill-slate-400" fontSize="9">
        {label}
      </text>
    </svg>
  )
}

function IconWrap({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${className}`}>{children}</span>
}

function eventLabel(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function Dashboard({ userName }: { userName: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [services, setServices] = useState<PlatformService[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const [now] = useState(() => new Date())

  const load = useCallback(() => {
    const headers = authHeaders()
    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/dashboard/stats`, { headers }),
      fetch(`${API_BASE_URL}/api/v1/platform/services`, { headers }),
    ])
      .then(async ([statsRes, svcRes]) => {
        if (statsRes.ok) setStats(await statsRes.json())
        if (svcRes.ok) setServices(await svcRes.json())
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 15000)
    return () => window.clearInterval(id)
  }, [load])

  const control = async (id: string, action: 'start' | 'stop' | 'restart') => {
    const service = services.find((item) => item.id === id)
    if ((action === 'stop' || action === 'restart') && service && CRITICAL.has(id)) {
      const ok = window.confirm(`${action === 'stop' ? 'Stop' : 'Restart'} ${service.name}? The control plane or database may go offline.`)
      if (!ok) return
    }
    setError('')
    setNotice('')
    setBusy(`${id}:${action}`)
    const r = await fetch(`${API_BASE_URL}/api/v1/platform/services/${id}/${action}`, { method: 'POST', headers: authHeaders() })
    const data = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) {
      setError(actionError(data.detail, `Could not ${action} ${id}`))
      return
    }
    setNotice(data.message || `${service?.name || id} ${action} requested`)
    window.setTimeout(load, 800)
  }

  const healthy = services.filter((item) => item.status === 'running' && item.health !== 'unhealthy').length
  const dockerMissing = services.some((item) => item.kind === 'container' && !item.docker_available)

  const assigned = stats?.ipam.assigned_ips ?? 0
  const available = stats?.ipam.available_ips ?? Math.max((stats?.ipam.total_ips ?? 0) - assigned, 0)
  const reserved = stats?.ipam.reserved_ips ?? 0
  const other = stats?.ipam.other_ips ?? 0
  const totalIps = stats?.ipam.total_ips ?? assigned + available + reserved + other
  const pct = (value: number) => (totalIps ? Math.round((value / totalIps) * 100) : 0)

  const zones = stats?.dns.zones?.length
    ? stats.dns.zones
    : stats
      ? [{ id: 0, name: stats.dns.total_zones ? 'Zones' : 'No zones', kind: 'forward', status: 'active', records: stats.dns.total_records }]
      : []

  const dateLabel = now.toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  const kpis = stats
    ? [
        {
          label: 'Hosts',
          value: stats.inventory.total_hosts,
          sub: `+${stats.inventory.hosts_30d ?? 0} this month`,
          color: '#60a5fa',
          iconClass: 'bg-sky-500/15 text-sky-300',
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="6" rx="1.5" />
              <rect x="3" y="14" width="18" height="6" rx="1.5" />
            </svg>
          ),
        },
        {
          label: 'Subnets',
          value: stats.ipam.total_subnets,
          sub: `${assigned} IPs assigned`,
          color: '#a78bfa',
          iconClass: 'bg-violet-500/15 text-violet-300',
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="18" cy="18" r="3" />
              <path d="M9 12h6M15 8l-6 3M15 16l-6-3" />
            </svg>
          ),
        },
        {
          label: 'DNS Records',
          value: stats.dns.total_records,
          sub: `${stats.dns.total_zones} zone${stats.dns.total_zones === 1 ? '' : 's'}`,
          color: '#34d399',
          iconClass: 'bg-emerald-500/15 text-emerald-300',
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="8" />
              <path d="M4 12h16M12 4c2.5 2.4 3.8 5.2 3.8 8S14.5 17.6 12 20C9.5 17.6 8.2 14.8 8.2 12S9.5 6.4 12 4z" />
            </svg>
          ),
        },
        {
          label: 'DHCP Leases',
          value: stats.dhcp.active_leases,
          sub: `${stats.dhcp.total_reservations} reserved`,
          color: '#2dd4bf',
          iconClass: 'bg-teal-500/15 text-teal-300',
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 18V6m0 12h6M14 6v12m0-12h6" />
            </svg>
          ),
        },
      ]
    : []

  const donutSegments = [
    { value: assigned, color: '#3b82f6' },
    { value: available, color: '#22c55e' },
    { value: reserved, color: '#f59e0b' },
    { value: other, color: '#64748b' },
  ]

  const attention = useMemo(() => {
    const items: string[] = []
    if ((stats?.pki?.expiring_30d ?? 0) > 0) items.push(`${stats!.pki!.expiring_30d} certificate${stats!.pki!.expiring_30d === 1 ? '' : 's'} expire within 30 days`)
    if (stats && !stats.smtp?.listening) items.push('SMTP listener is off')
    return items
  }, [stats])

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Welcome back, {userName}</h1>
          <p className="mt-1.5 text-sm text-slate-400">Here&apos;s what&apos;s happening across your infrastructure today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-500">{dateLabel}</p>
          <div className="relative">
            <button type="button" onClick={() => setQuickOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 hover:bg-indigo-500">
              + Quick Action
              <span className="text-[10px]">▾</span>
            </button>
            {quickOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-lg border border-white/10 bg-[#111827] shadow-xl">
                {QUICK_ACTIONS.map((item) => (
                  <Link key={item.to} to={item.to} onClick={() => setQuickOpen(false)} className="block px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {attention.length ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {attention.join(' · ')}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats === null
          ? [0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-[#121a27]" />)
          : kpis.map((kpi) => (
              <div key={kpi.label} className={card}>
                <div className="flex items-start justify-between">
                  <IconWrap className={kpi.iconClass}>{kpi.icon}</IconWrap>
                  <Sparkline seed={Number(kpi.value)} color={kpi.color} />
                </div>
                <div className="mt-4 text-3xl font-semibold tabular-nums text-white">{kpi.value}</div>
                <div className="mt-1 text-sm font-medium text-slate-200">{kpi.label}</div>
                <div className="mt-1 text-xs text-slate-500">{kpi.sub}</div>
              </div>
            ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={card}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">IP Address Utilization</h2>
            <Link to="/ipam/addresses" className="text-xs text-indigo-300 hover:text-indigo-200">
              View IPAM →
            </Link>
          </div>
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <Donut segments={donutSegments} total={totalIps} label="Total IPs" />
            <ul className="w-full space-y-2 text-sm">
              {[
                { label: 'Assigned', value: assigned, color: 'bg-blue-500' },
                { label: 'Available', value: available, color: 'bg-emerald-500' },
                { label: 'Reserved', value: reserved, color: 'bg-amber-400' },
                { label: 'Other', value: other, color: 'bg-slate-500' },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-slate-300">
                    <span className={`h-2.5 w-2.5 rounded-full ${row.color}`} />
                    {row.label}
                  </span>
                  <span className="tabular-nums text-slate-400">
                    {pct(row.value)}% <span className="text-slate-500">({row.value})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={`${card} flex flex-col`}>
          <h2 className="text-sm font-semibold text-white">DNS Zones</h2>
          <div className="mt-4 flex-1 space-y-2">
            {!stats || (stats.dns.total_zones === 0 && !stats.dns.zones?.length) ? (
              <p className="text-sm text-slate-500">No DNS zones yet.</p>
            ) : (
              zones.map((zone) => (
                <div key={zone.id || zone.name} className="flex items-center justify-between rounded-xl border border-white/5 bg-[#0b1220] px-3 py-3">
                  <div>
                    <div className="font-medium text-white">{zone.name}</div>
                    <div className="text-xs text-slate-500">{zone.records} records</div>
                  </div>
                  <Badge tone={zone.status === 'active' ? 'success' : 'neutral'}>{zone.status === 'active' ? 'Healthy' : zone.status}</Badge>
                </div>
              ))
            )}
          </div>
          <Link to="/dns" className={linkBtn}>
            Manage DNS Zones →
          </Link>
        </div>

        <div className={`${card} flex flex-col`}>
          <h2 className="text-sm font-semibold text-white">DHCP</h2>
          <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
            {stats && stats.dhcp.active_leases > 0 ? (
              <>
                <div className="text-3xl font-semibold text-white">{stats.dhcp.active_leases}</div>
                <p className="mt-1 text-sm text-slate-400">Active leases across {stats.dhcp.total_pools} pools</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-200">No active leases</p>
                <p className="mt-1 max-w-[16rem] text-xs leading-5 text-slate-500">
                  {stats && stats.dhcp.total_servers > 0
                    ? 'DHCP server is registered and ready.'
                    : 'Enable local DHCP or fetch the table from your router on the DHCP page.'}
                </p>
              </>
            )}
          </div>
          <Link to="/dhcp" className={linkBtn}>
            View DHCP →
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={`${card} flex flex-col`}>
          <h2 className="text-sm font-semibold text-white">Certificate Authority</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-semibold text-emerald-300">{stats?.pki?.active_certs ?? 0}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Active</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-amber-300">{stats?.pki?.expiring_30d ?? 0}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Expiring soon</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-rose-300">{stats?.pki?.expired ?? 0}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Expired</div>
            </div>
          </div>
          <Link to="/pki" className={linkBtn}>
            Manage Certificates →
          </Link>
        </div>

        <div className={`${card} flex flex-col`}>
          <h2 className="text-sm font-semibold text-white">Directory</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-semibold text-white">{stats?.auth.total_users ?? 0}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Users</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white">{stats?.inventory.total_groups ?? 0}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Groups</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white">{stats?.auth.total_roles ?? 0}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">Roles</div>
            </div>
          </div>
          <Link to="/ldap" className={linkBtn}>
            Browse Directory →
          </Link>
        </div>

        <div className={`${card} flex flex-col`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Mail / SMTP</h2>
            <Badge tone={stats?.smtp?.listening ? 'success' : 'neutral'}>{stats?.smtp?.listening ? 'Online' : 'Offline'}</Badge>
          </div>
          <div className="mt-6 flex-1">
            <div className="text-sm font-medium text-slate-200">SMTP Server</div>
            <p className="mt-1 text-sm text-slate-400">
              {stats?.smtp?.listening ? 'Ready and accepting connections.' : 'Listener is off. Start it from System Status or Mail settings.'}
            </p>
            <p className="mt-3 text-xs text-slate-500">{stats?.smtp?.relays ?? 0} relay{stats?.smtp?.relays === 1 ? '' : 's'} configured</p>
          </div>
          <Link to="/smtp" className={linkBtn}>
            View Mail Settings →
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
        <div className={`${card} p-0 overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <Link to="/logs/audit" className="text-xs text-indigo-300 hover:text-indigo-200">
              View all →
            </Link>
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Details</th>
                <th className="px-5 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {!stats || stats.audit.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-sm text-slate-500">
                    No activity yet.
                  </td>
                </tr>
              ) : (
                stats.audit.slice(0, 6).map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-3 py-3 font-medium text-white">{eventLabel(log.action)}</td>
                    <td className="hidden px-3 py-3 text-slate-400 md:table-cell">{log.resource}</td>
                    <td className="px-5 py-3">
                      <Badge tone={log.success ? 'success' : 'danger'}>{log.success ? 'OK' : 'Fail'}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={`${card} p-0 overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white">System Status</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {healthy}/{services.length || 0} operational
                {dockerMissing ? ' · Docker socket needed for container control' : ''}
              </p>
            </div>
            <Link to="/logs/system" className="text-xs text-indigo-300 hover:text-indigo-200">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-white/5">
            {services.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">Loading services…</p>
            ) : (
              services.map((service) => {
                const tone = healthTone(service.health, service.status)
                const working = busy.startsWith(`${service.id}:`)
                const operational = tone === 'success'
                return (
                  <div key={service.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white">{service.name}</div>
                      <div className="truncate text-xs text-slate-500">{service.detail || service.role}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs ${operational ? 'text-emerald-300' : tone === 'warning' ? 'text-amber-300' : tone === 'danger' ? 'text-rose-300' : 'text-slate-400'}`}>
                      <span className={`h-2 w-2 rounded-full ${operational ? 'bg-emerald-400' : tone === 'warning' ? 'bg-amber-400' : tone === 'danger' ? 'bg-rose-400' : 'bg-slate-500'}`} />
                      {healthLabel(service)}
                    </span>
                    <div className="flex gap-1">
                      <button type="button" data-service-id={service.id} data-action="start" title="Start" disabled={!service.controllable || working || service.status === 'running'} onClick={() => void control(service.id, 'start')} className={btnGhost}>
                        Start
                      </button>
                      <button type="button" data-service-id={service.id} data-action="stop" title="Stop" disabled={!service.controllable || working || service.status === 'stopped'} onClick={() => void control(service.id, 'stop')} className={btnGhost}>
                        Stop
                      </button>
                      <button type="button" data-service-id={service.id} data-action="restart" title="Restart" disabled={!service.controllable || Boolean(busy)} onClick={() => void control(service.id, 'restart')} className={btnGhost}>
                        Restart
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
