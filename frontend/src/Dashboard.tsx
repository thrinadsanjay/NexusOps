import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from './apiBase'
import { Alert, Badge, KpiCard, PageHeader, btnGhost, btnSecondary, cardClass, tableWrapClass } from './ui'

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

type Stats = {
  auth: { total_users: number; active_users: number; total_roles: number; total_permissions: number; active_tokens: number }
  ipam: { total_vlans: number; total_subnets: number; assigned_ips: number; total_ips: number }
  inventory: { total_hosts: number; active_hosts: number; unknown_hosts: number }
  dns: { total_zones: number; forward_zones: number; total_records: number }
  dhcp: { total_servers: number; total_pools: number; active_leases: number; total_reservations: number }
  pki?: { total_cas: number; total_certs: number; active_certs: number; expiring_30d: number }
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

const MODULES = [
  { title: 'Network', to: '/ipam', desc: 'Subnets, VLANs, addresses' },
  { title: 'Inventory', to: '/inventory', desc: 'Hosts, groups, tags' },
  { title: 'DNS', to: '/dns', desc: 'Zones and Cloudflare sync' },
  { title: 'DHCP', to: '/dhcp', desc: 'Pools and reservations' },
  { title: 'Mail', to: '/smtp', desc: 'Relay and LAN listener' },
  { title: 'Certificates', to: '/pki', desc: "Let's Encrypt and CAs" },
  { title: 'Directory', to: '/ldap', desc: 'LDAP browse and sync' },
  { title: 'Logs', to: '/logs/audit', desc: 'Audit and application logs' },
] as const

const CRITICAL = new Set(['backend', 'postgres', 'frontend'])

function healthTone(health: string, status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'restarting' || health === 'starting') return 'warning'
  if (health === 'healthy' || health === 'up' || status === 'running') return 'success'
  if (health === 'unhealthy' || status === 'stopped') return 'danger'
  return 'neutral'
}

function healthLabel(service: PlatformService): string {
  if (service.status === 'restarting') return 'Restarting'
  if (service.health === 'healthy') return 'Healthy'
  if (service.health === 'unhealthy') return 'Unhealthy'
  if (service.status === 'running') return 'Running'
  if (service.status === 'stopped') return 'Stopped'
  return 'Unknown'
}

function statusDot(tone: 'success' | 'warning' | 'danger' | 'neutral'): string {
  if (tone === 'success') return 'bg-emerald-400'
  if (tone === 'warning') return 'bg-amber-400'
  if (tone === 'danger') return 'bg-rose-400'
  return 'bg-slate-500'
}

export function Dashboard({ userName }: { userName: string }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [services, setServices] = useState<PlatformService[]>([])
  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(() => {
    const headers = authHeaders()
    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/dashboard/stats`, { headers }),
      fetch(`${API_BASE_URL}/api/v1/platform/services`, { headers }),
    ])
      .then(async ([statsRes, svcRes]) => {
        if (statsRes.ok) setStats(await statsRes.json())
        if (svcRes.ok) setServices(await svcRes.json())
        setUpdatedAt(new Date())
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
      const ok = window.confirm(
        `${action === 'stop' ? 'Stop' : 'Restart'} ${service.name}? The control plane or database may go offline.`,
      )
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
  const overall = services.length === 0 ? 'Checking' : healthy === services.length ? 'Healthy' : healthy === 0 ? 'Down' : 'Degraded'
  const dockerReady = services.some((item) => item.kind === 'container' && item.docker_available)
  const dockerMissing = services.some((item) => item.kind === 'container' && !item.docker_available)

  const kpis = stats
    ? [
        { label: 'Services', value: `${healthy}/${services.length || 0}`, sub: overall },
        { label: 'Hosts', value: stats.inventory.total_hosts, sub: `${stats.inventory.active_hosts} active` },
        {
          label: 'Addresses',
          value: stats.ipam.assigned_ips,
          sub: stats.ipam.total_ips ? `${stats.ipam.total_subnets} subnets · ${stats.ipam.total_ips} IPs` : `${stats.ipam.total_subnets} subnets`,
        },
        { label: 'DNS records', value: stats.dns.total_records, sub: `${stats.dns.total_zones} zones` },
        { label: 'Certificates', value: stats.pki?.active_certs ?? 0, sub: `${stats.pki?.expiring_30d ?? 0} expiring` },
        { label: 'Mail', value: stats.smtp?.relays ?? 0, sub: stats.smtp?.listening ? 'Listener up' : 'Listener off' },
      ]
    : []

  const attention = useMemo(() => {
    const items: { tone: 'warning' | 'danger' | 'info'; text: string; to: string }[] = []
    if ((stats?.pki?.expiring_30d ?? 0) > 0) {
      items.push({
        tone: 'warning',
        text: `${stats!.pki!.expiring_30d} certificate${stats!.pki!.expiring_30d === 1 ? '' : 's'} expire within 30 days`,
        to: '/pki',
      })
    }
    if ((stats?.attention?.failed_audit ?? 0) > 0) {
      items.push({
        tone: 'danger',
        text: `${stats!.attention!.failed_audit} failed audit event${stats!.attention!.failed_audit === 1 ? '' : 's'}`,
        to: '/logs/audit',
      })
    }
    if (stats && !stats.smtp?.listening) {
      items.push({ tone: 'info', text: 'SMTP listener is off', to: '/smtp' })
    }
    if (stats && !stats.cloudflare?.accounts) {
      items.push({ tone: 'info', text: 'Cloudflare DNS token is not configured', to: '/dns' })
    }
    services
      .filter((item) => item.id !== 'smtp' && (item.status === 'stopped' || item.health === 'unhealthy'))
      .forEach((item) => {
        items.push({ tone: 'danger', text: `${item.name} is ${item.status === 'stopped' ? 'stopped' : 'unhealthy'}`, to: '/' })
      })
    return items.slice(0, 6)
  }, [services, stats])

  return (
    <section className="space-y-6">
      <PageHeader
        title="Overview"
        description={`Operations snapshot for ${userName}. Start, stop, or restart platform services from this page.`}
        actions={
          <>
            <span
              className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium ${
                overall === 'Healthy'
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                  : overall === 'Degraded'
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                    : overall === 'Down'
                      ? 'border-rose-500/20 bg-rose-500/10 text-rose-300'
                      : 'border-white/10 bg-white/5 text-slate-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot(overall === 'Healthy' ? 'success' : overall === 'Degraded' ? 'warning' : overall === 'Down' ? 'danger' : 'neutral')}`} />
              Platform {overall.toLowerCase()}
            </span>
            {updatedAt ? <span className="text-xs text-slate-500">Updated {updatedAt.toLocaleTimeString()}</span> : null}
            <button type="button" onClick={load} className={btnSecondary}>
              Refresh
            </button>
          </>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {dockerMissing ? (
        <Alert tone="info">
          {dockerReady
            ? 'Some container actions are unavailable.'
            : 'Docker socket is not mounted on the API container. Status still updates from probes; Start/Stop/Restart for compose services needs /var/run/docker.sock. The SMTP listener can still be controlled here.'}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {stats === null
          ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-white/10 bg-[#151b24]" />)
          : kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <div className={`${tableWrapClass} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Platform services</h2>
              <p className="mt-0.5 text-xs text-slate-500">Compose stack and the in-process SMTP listener.</p>
            </div>
            <Badge tone={overall === 'Healthy' ? 'success' : overall === 'Degraded' ? 'warning' : overall === 'Down' ? 'danger' : 'neutral'}>
              {healthy} running
            </Badge>
          </div>
          {services.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">Loading services…</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#0b1220] text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Detail</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {services.map((service) => {
                  const tone = healthTone(service.health, service.status)
                  const working = busy.startsWith(`${service.id}:`)
                  return (
                    <tr key={service.id} className="align-middle">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(tone)}`} />
                          <div>
                            <div className="font-medium text-white">{service.name}</div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-600">
                              {service.role}
                              {service.kind === 'process' ? ' · process' : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <Badge tone={tone}>{healthLabel(service)}</Badge>
                      </td>
                      <td className="hidden max-w-xs truncate px-3 py-3.5 text-xs text-slate-500 md:table-cell">{service.detail}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            data-service-id={service.id}
                            data-action="start"
                            title={service.controllable ? 'Start this service' : 'Control is unavailable without the Docker socket'}
                            disabled={!service.controllable || working || service.status === 'running'}
                            onClick={() => void control(service.id, 'start')}
                            className={btnGhost}
                          >
                            Start
                          </button>
                          <button
                            type="button"
                            data-service-id={service.id}
                            data-action="stop"
                            title={service.controllable ? 'Stop this service' : 'Control is unavailable without the Docker socket'}
                            disabled={!service.controllable || working || service.status === 'stopped'}
                            onClick={() => void control(service.id, 'stop')}
                            className={btnGhost}
                          >
                            Stop
                          </button>
                          <button
                            type="button"
                            data-service-id={service.id}
                            data-action="restart"
                            title={service.controllable ? 'Restart this service' : 'Control is unavailable without the Docker socket'}
                            disabled={!service.controllable || Boolean(busy)}
                            onClick={() => void control(service.id, 'restart')}
                            className={btnGhost}
                          >
                            Restart
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-6">
          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-white">Needs attention</h2>
            <div className="mt-3 space-y-2">
              {attention.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing waiting. Stack looks clean.</p>
              ) : (
                attention.map((item) => (
                  <Link key={item.text} to={item.to} className="block rounded-lg border border-white/5 bg-[#0b1220] px-3 py-2.5 transition hover:border-indigo-500/30">
                    <Badge tone={item.tone === 'info' ? 'info' : item.tone}>{item.tone === 'danger' ? 'Alert' : item.tone === 'warning' ? 'Watch' : 'Info'}</Badge>
                    <div className="mt-1.5 text-sm text-slate-200">{item.text}</div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className={cardClass}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Recent activity</h2>
              <Link to="/logs/audit" className="text-xs text-slate-500 hover:text-indigo-300">
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {!stats || stats.audit.length === 0 ? (
                <p className="text-sm text-slate-500">No activity yet.</p>
              ) : (
                stats.audit.slice(0, 7).map((log) => (
                  <div key={log.id} className="rounded-lg border border-white/5 bg-[#0b1220] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white">{log.action}</span>
                      <Badge tone={log.success ? 'success' : 'danger'}>{log.success ? 'ok' : 'fail'}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{log.resource}</div>
                    <div className="mt-1 text-[11px] text-slate-600">{new Date(log.created_at).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-white">Modules</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MODULES.map((item) => (
            <Link key={item.title} to={item.to} className="rounded-xl border border-white/10 bg-[#151b24] px-4 py-3 transition hover:border-indigo-500/30">
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <div className="mt-1 text-xs text-slate-500">{item.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
