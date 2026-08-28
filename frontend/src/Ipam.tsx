import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'

import { API_BASE_URL, authHeaders } from './api/client'
import { confirmDelete } from './confirm'
import { breadcrumbsFor } from './layout/navigation'
import { CopyText } from './ui/copy'
import { EmptyState, PageHeader } from './ui/page'
import { FilterBar, Table, TableFrame, THead, Td, filterInputClass } from './ui/table'
import { RelativeTime } from './ui/time'
import { toast } from './ui/toast'

// ── types ──────────────────────────────────────────────────────────────────

export type VLan = { id: number; vid: number; name: string; description: string | null; status: string }
export type Subnet = { id: number; cidr: string; name: string; description: string | null; gateway: string | null; vlan_id: number | null; status: string }
export type IPAddress = { id: number; address: string; subnet_id: number | null; hostname: string | null; description: string | null; status: string; dns_name: string | null; mac_address: string | null; last_seen_at: string | null }
export type SubnetUtil = { subnet_id: number; cidr: string; total: number; used: number; available: number; percent_used: number }
export type DiscoveredNetwork = { cidr: string; interface: string }

// ── shared helpers ──────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-ok/15 text-ok',
  reserved: 'bg-warn/15 text-warn',
  deprecated: 'bg-elevated text-muted',
  available: 'bg-accent/15 text-accent',
  assigned: 'bg-accent/15 text-accent',
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_BADGE[status] ?? 'bg-elevated text-muted'}`}>{status}</span>
}

function UtilBar({ util }: { util: SubnetUtil }) {
  const pct = Math.min(util.percent_used, 100)
  const color = pct > 85 ? 'bg-danger' : pct > 60 ? 'bg-warn' : 'bg-ok'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{util.used} used / {util.total} total</span>
        <span className="font-semibold text-ink">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-accent">{util.available} available</div>
    </div>
  )
}

// ── Network overview (discovery + utilization) ─────────────────────────────

export function NetworkOverview() {
  const [subnets, setSubnets] = useState<Subnet[]>([])
  const [utils, setUtils] = useState<Record<number, SubnetUtil>>({})
  const [scanStates, setScanStates] = useState<Record<number, string>>({})
  const [lastScans, setLastScans] = useState<Record<number, string>>({})
  const [discovered, setDiscovered] = useState<DiscoveredNetwork[]>([])
  const [discovering, setDiscovering] = useState(false)
  const [loading, setLoading] = useState(true)

  // quick-add form
  const [quickCidr, setQuickCidr] = useState('')
  const [quickName, setQuickName] = useState('')
  const [quickGateway, setQuickGateway] = useState('')
  const [quickError, setQuickError] = useState('')
  const [quickAdding, setQuickAdding] = useState(false)
  const pollTimers = useRef<number[]>([])

  useEffect(() => () => {
    pollTimers.current.forEach((id) => window.clearInterval(id))
  }, [])

  const loadUtil = useCallback((s: Subnet) => {
    fetch(`${API_BASE_URL}/api/v1/ipam/subnets/${s.id}/utilization`, { headers: authHeaders() })
      .then((r) => r.json()).then((u: SubnetUtil) => setUtils((prev) => ({ ...prev, [s.id]: u }))).catch(() => undefined)
  }, [])

  const loadAll = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/ipam/subnets`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Subnet[]) => { setSubnets(Array.isArray(data) ? data : []); (Array.isArray(data) ? data : []).forEach(loadUtil) })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [loadUtil])

  useEffect(() => { loadAll() }, [loadAll])

  const handleScan = async (subnetId: number) => {
    setScanStates((p) => ({ ...p, [subnetId]: 'scanning' }))
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ipam/subnets/${subnetId}/scan`, { method: 'POST', headers: authHeaders() })
      const payload = await r.json()
      if (!r.ok) {
        setScanStates((p) => ({ ...p, [subnetId]: payload.detail ?? 'scan refused' }))
        return
      }
      const poll = window.setInterval(async () => {
        const sr = await fetch(`${API_BASE_URL}/api/v1/ipam/scan/${payload.task_id}`, { headers: authHeaders() })
        const s = await sr.json()
        if (s.status === 'SUCCESS' || s.status === 'FAILURE') {
          window.clearInterval(poll)
          const ok = s.status === 'SUCCESS'
          setScanStates((p) => ({ ...p, [subnetId]: ok ? `done – ${s.result?.added ?? 0} added, ${s.result?.updated ?? 0} updated` : 'scan error' }))
          if (ok) {
            setLastScans((p) => ({ ...p, [subnetId]: new Date().toISOString() }))
            toast.ok('Subnet scan finished')
          } else {
            toast.error('Subnet scan failed')
          }
          loadAll()
        }
      }, 2000)
      pollTimers.current.push(poll)
    } catch {
      setScanStates((p) => ({ ...p, [subnetId]: 'error' }))
    }
  }

  const handleDiscover = useCallback(async () => {
    setDiscovering(true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ipam/discover`, { headers: authHeaders() })
      setDiscovered(await r.json())
    } catch {
      setDiscovered([])
    } finally {
      setDiscovering(false)
    }
  }, [])

  // auto-detect on mount so the page shows likely LAN subnets immediately
  useEffect(() => { handleDiscover() }, [handleDiscover])

  const handleQuickAdd = async (e: FormEvent, prefillCidr?: string) => {
    e.preventDefault()
    const cidr = prefillCidr ?? quickCidr
    const name = prefillCidr ? cidr : (quickName || cidr)
    if (!cidr) return
    setQuickAdding(true); setQuickError('')
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ipam/subnets`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ cidr, name, gateway: quickGateway || null, status: 'active' }),
      })
      const data = await r.json()
      if (!r.ok) { setQuickError(data.detail ?? 'Failed to add subnet'); toast.error(data.detail ?? 'Failed to add subnet'); return }
      setSubnets((p) => [...p, data].sort((a, b) => a.cidr.localeCompare(b.cidr)))
      loadUtil(data)
      toast.ok(`Added ${data.cidr}`)
      setQuickCidr(''); setQuickName(''); setQuickGateway('')
      // auto-kick scan
      const sr = await fetch(`${API_BASE_URL}/api/v1/ipam/subnets/${data.id}/scan`, { method: 'POST', headers: authHeaders() })
      const scanPayload = await sr.json()
      if (!sr.ok) {
        setScanStates((p) => ({ ...p, [data.id]: scanPayload.detail ?? 'scan refused' }))
        return
      }
      setScanStates((p) => ({ ...p, [data.id]: 'scanning' }))
      const poll = window.setInterval(async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/ipam/scan/${scanPayload.task_id}`, { headers: authHeaders() })
        const s = await res.json()
        if (s.status === 'SUCCESS' || s.status === 'FAILURE') {
          window.clearInterval(poll)
          const ok = s.status === 'SUCCESS'
          setScanStates((p) => ({ ...p, [data.id]: ok ? `done – ${s.result?.added ?? 0} added` : 'scan error' }))
          if (ok) setLastScans((p) => ({ ...p, [data.id]: new Date().toISOString() }))
          loadAll()
        }
      }, 2000)
      pollTimers.current.push(poll)
    } catch {
      setQuickError('Request failed')
    } finally {
      setQuickAdding(false)
    }
  }

  const configuredNets = discovered.filter((d) => d.interface === 'configured')
  const containerNets = discovered.filter((d) => d.interface !== 'configured')
  const ranked = [...subnets].sort((a, b) => (utils[b.id]?.percent_used ?? 0) - (utils[a.id]?.percent_used ?? 0))

  return (
    <section className="space-y-6">
      <PageHeader
        crumbs={breadcrumbsFor('/ipam')}
        title="Network overview"
        description="Utilization of registered subnets, discovery scans, and LAN prefixes."
        actions={
          <button onClick={handleDiscover} disabled={discovering} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-sm font-medium text-muted transition hover:bg-elevated disabled:opacity-60">
            {discovering ? 'Detecting…' : 'Re-detect networks'}
          </button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-elevated" />)}
        </div>
      ) : ranked.length === 0 ? (
        <EmptyState title="No subnets yet" body="Add a LAN prefix below to track utilization and scan for live hosts." />
      ) : (
        <ul className="space-y-3">
          {ranked.map((s) => {
            const u = utils[s.id]
            const sc = scanStates[s.id]
            return (
              <li key={s.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <CopyText value={s.cidr} label="CIDR" className="text-lg font-bold text-ink" />
                    <div className="mt-0.5 text-sm text-muted">{s.name}</div>
                    {s.gateway && <div className="mt-1 font-mono text-[11px] text-muted">GW {s.gateway}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={s.status} />
                    <button onClick={() => handleScan(s.id)} disabled={sc === 'scanning'} className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent transition hover:bg-accent/20 disabled:opacity-60">
                      {sc === 'scanning' ? 'Scanning…' : 'Scan'}
                    </button>
                  </div>
                </div>
                <div className="mt-4">{u ? <UtilBar util={u} /> : <div className="h-2 w-full animate-pulse rounded-full bg-elevated" />}</div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                  <span>Last scan: {lastScans[s.id] ? <RelativeTime value={lastScans[s.id]} /> : 'not scanned this session'}</span>
                  {sc && sc !== 'scanning' && (
                    <span className={`rounded-xl px-2 py-1 ${sc.startsWith('done') ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'}`}>{sc}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleQuickAdd} className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-ink">Add subnet</p>
          <p className="mt-1 text-[12px] text-muted">Registers the prefix and starts a host discovery scan.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted">CIDR</label>
            <input value={quickCidr} onChange={(e) => setQuickCidr(e.target.value)} required placeholder="192.168.1.0/24" className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 font-mono text-ink outline-none focus:border-accent" />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted">Name</label>
            <input value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Home LAN" className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted">Gateway</label>
            <input value={quickGateway} onChange={(e) => setQuickGateway(e.target.value)} placeholder="192.168.1.1" className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 font-mono text-ink outline-none focus:border-accent" />
          </div>
          <button type="submit" disabled={quickAdding} className="h-[46px] rounded-2xl bg-accent px-5 font-semibold text-accent-fg shadow-sm transition hover:opacity-90 disabled:opacity-60">
            {quickAdding ? 'Adding…' : 'Add & scan'}
          </button>
        </div>
        {quickError && <p className="mt-3 rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{quickError}</p>}
      </form>

      {/* Discovered networks panel */}
      {discovered.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
          {configuredNets.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-ok">Auto-detected LAN networks (reachable via gateway probe)</p>
              <p className="mb-3 text-[11px] text-muted">These subnets responded during gateway probing. Click any one to register it and start a host discovery scan.</p>
              <div className="flex flex-wrap gap-3">
                {configuredNets.map((n) => (
                  <form key={n.cidr} onSubmit={(e) => handleQuickAdd(e, n.cidr)}>
                    <button type="submit" className="flex items-center gap-2 rounded-xl border border-ok/30 bg-canvas/60 px-3 py-2 text-sm transition hover:border-accent">
                      <span className="font-mono font-semibold text-ink">{n.cidr}</span>
                      <span className="text-[11px] text-muted">click to add &amp; scan →</span>
                    </button>
                  </form>
                ))}
              </div>
            </div>
          )}
          {containerNets.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-muted">Container interfaces (Docker bridge — not your LAN)</p>
              <div className="flex flex-wrap gap-3">
                {containerNets.map((n) => (
                  <div key={n.cidr} className="flex items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 py-2 text-sm">
                    <span className="font-mono font-semibold text-muted">{n.cidr}</span>
                    <span className="text-faint">{n.interface}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-faint">To always show specific subnets here, add <code className="rounded bg-elevated px-1 py-0.5 text-accent">SCAN_NETWORKS=192.168.1.0/24</code> to your <code className="rounded bg-elevated px-1 py-0.5 text-accent">.env</code> and restart.</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── VLANs panel ────────────────────────────────────────────────────────────

export function VLansPanel() {
  const [vlans, setVlans] = useState<VLan[]>([])
  const [vid, setVid] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/ipam/vlans`, { headers: authHeaders() })
      .then((r) => r.json()).then(setVlans).catch(() => setError('Failed to load VLANs'))
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const res = await fetch(`${API_BASE_URL}/api/v1/ipam/vlans`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ vid: Number(vid), name, description: description || null, status: 'active' }) })
    const data = await res.json()
    if (!res.ok) { setError(data.detail ?? 'Failed'); toast.error(data.detail ?? 'Failed'); return }
    setVlans((p) => [...p, data].sort((a, b) => a.vid - b.vid))
    toast.ok('VLAN added')
    setVid(''); setName(''); setDescription('')
  }

  const handleDelete = async (id: number, name: string) => {
    if (!(await confirmDelete(`VLAN "${name}"`))) return
    const r = await fetch(`${API_BASE_URL}/api/v1/ipam/vlans/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setVlans((p) => p.filter((v) => v.id !== id)); toast.ok(`Deleted ${name}`) }
  }

  return (
    <section className="space-y-6">
      <PageHeader crumbs={breadcrumbsFor('/ipam/vlans')} title="VLANs" description="802.1Q VLAN registry for your network segments." />
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-line bg-surface p-5 md:grid-cols-3">
        <div><label className="mb-2 block text-sm font-medium text-ink">VLAN ID (1–4094)</label><input type="number" min={1} max={4094} value={vid} onChange={(e) => setVid(e.target.value)} required className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">Name</label><input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" /></div>
        {error && <p className="md:col-span-3 rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="md:col-span-3 flex justify-end"><button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 font-semibold text-accent-fg transition hover:opacity-90">Add VLAN</button></div>
      </form>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="min-w-full divide-y divide-line text-left text-sm">
          <thead className="bg-canvas/80 text-muted"><tr><th className="px-4 py-3 font-medium">VID</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-line bg-surface/70">
            {vlans.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No VLANs defined yet.</td></tr>
              : vlans.map((v) => (
                <tr key={v.id} className="hover:bg-elevated/70">
                  <td className="px-4 py-4 font-mono font-semibold text-ink">{v.vid}</td>
                  <td className="px-4 py-4 text-ink">{v.name}</td>
                  <td className="px-4 py-4 text-muted">{v.description ?? '—'}</td>
                  <td className="px-4 py-4"><StatusBadge status={v.status} /></td>
                  <td className="px-4 py-4 text-right"><button onClick={() => handleDelete(v.id, v.name)} className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-1 text-xs text-danger hover:bg-danger/20">Delete</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Subnets panel ──────────────────────────────────────────────────────────

export function SubnetsPanel() {
  const [subnets, setSubnets] = useState<Subnet[]>([])
  const [vlans, setVlans] = useState<VLan[]>([])
  const [utils, setUtils] = useState<Record<number, SubnetUtil>>({})
  const [cidr, setCidr] = useState('')
  const [name, setName] = useState('')
  const [gateway, setGateway] = useState('')
  const [vlanId, setVlanId] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const loadUtil = useCallback((s: Subnet) => {
    fetch(`${API_BASE_URL}/api/v1/ipam/subnets/${s.id}/utilization`, { headers: authHeaders() })
      .then((r) => r.json()).then((u: SubnetUtil) => setUtils((p) => ({ ...p, [s.id]: u }))).catch(() => undefined)
  }, [])

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/ipam/subnets`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/ipam/vlans`, { headers: authHeaders() }).then((r) => r.json()),
    ]).then(([s, v]) => { setSubnets(s); setVlans(v); s.forEach(loadUtil) }).catch(() => setError('Failed to load'))
  }, [loadUtil])

  const vlanLabel = (id: number | null) => {
    if (!id) return '—'
    const v = vlans.find((v) => v.id === id)
    return v ? `VLAN ${v.vid} – ${v.name}` : String(id)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const res = await fetch(`${API_BASE_URL}/api/v1/ipam/subnets`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ cidr, name, description: description || null, gateway: gateway || null, vlan_id: vlanId ? Number(vlanId) : null, status: 'active' }) })
    const data = await res.json()
    if (!res.ok) { setError(data.detail ?? 'Failed'); toast.error(data.detail ?? 'Failed'); return }
    setSubnets((p) => [...p, data].sort((a, b) => a.cidr.localeCompare(b.cidr)))
    loadUtil(data)
    toast.ok(`Added ${data.cidr}`)
    setCidr(''); setName(''); setGateway(''); setVlanId(''); setDescription('')
  }

  const handleDelete = async (id: number, name: string) => {
    if (!(await confirmDelete(`subnet "${name}"`))) return
    const r = await fetch(`${API_BASE_URL}/api/v1/ipam/subnets/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setSubnets((p) => p.filter((s) => s.id !== id)); toast.ok(`Deleted ${name}`) }
  }

  return (
    <section className="space-y-6">
      <PageHeader crumbs={breadcrumbsFor('/ipam/subnets')} title="Subnets" description="Add your LAN prefixes here. After adding a subnet, head to Network Overview to scan it." />
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-line bg-surface p-5 md:grid-cols-2 xl:grid-cols-3">
        <div><label className="mb-2 block text-sm font-medium text-ink">CIDR (e.g. 192.168.10.0/24)</label><input value={cidr} onChange={(e) => setCidr(e.target.value)} required className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 font-mono text-ink outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">Name</label><input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">Gateway</label><input value={gateway} onChange={(e) => setGateway(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 font-mono text-ink outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">VLAN</label><select value={vlanId} onChange={(e) => setVlanId(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent"><option value="">— none —</option>{vlans.map((v) => <option key={v.id} value={v.id}>VLAN {v.vid} – {v.name}</option>)}</select></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" /></div>
        {error && <p className="md:col-span-2 xl:col-span-3 rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="md:col-span-2 xl:col-span-3 flex justify-end"><button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 font-semibold text-accent-fg transition hover:opacity-90">Add subnet</button></div>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="min-w-full divide-y divide-line text-left text-sm">
          <thead className="bg-canvas/80 text-muted">
            <tr><th className="px-4 py-3 font-medium">CIDR</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Gateway</th><th className="px-4 py-3 font-medium">VLAN</th><th className="px-4 py-3 font-medium min-w-[200px]">Utilization</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface/70">
            {subnets.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">No subnets defined yet.</td></tr>
              : subnets.map((s) => (
                <tr key={s.id} className="hover:bg-elevated/70">
                  <td className="px-4 py-4"><CopyText value={s.cidr} label="CIDR" className="font-semibold text-ink" /></td>
                  <td className="px-4 py-4 text-ink">{s.name}</td>
                  <td className="px-4 py-4 font-mono text-muted">{s.gateway ?? '—'}</td>
                  <td className="px-4 py-4 text-muted">{vlanLabel(s.vlan_id)}</td>
                  <td className="px-4 py-4 min-w-[200px]">{utils[s.id] ? <UtilBar util={utils[s.id]} /> : <div className="h-2 w-full animate-pulse rounded-full bg-elevated" />}</td>
                  <td className="px-4 py-4"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-4 text-right"><button onClick={() => handleDelete(s.id, s.name)} className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-1 text-xs text-danger hover:bg-danger/20">Delete</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── IP Addresses panel ─────────────────────────────────────────────────────

export function IPAddressesPanel() {
  const [ips, setIps] = useState<IPAddress[]>([])
  const [subnets, setSubnets] = useState<Subnet[]>([])
  const [address, setAddress] = useState('')
  const [subnetId, setSubnetId] = useState('')
  const [hostname, setHostname] = useState('')
  const [description, setDescription] = useState('')
  const [mac, setMac] = useState('')
  const [dnsName, setDnsName] = useState('')
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/ipam/addresses`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/ipam/subnets`, { headers: authHeaders() }).then((r) => r.json()),
    ]).then(([i, s]) => { setIps(i); setSubnets(s) }).catch(() => setError('Failed to load'))
  }, [])

  const subnetLabel = (id: number | null) => subnets.find((s) => s.id === id)?.cidr ?? '—'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const res = await fetch(`${API_BASE_URL}/api/v1/ipam/addresses`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ address, subnet_id: subnetId ? Number(subnetId) : null, hostname: hostname || null, description: description || null, mac_address: mac || null, dns_name: dnsName || null, status: 'assigned' }) })
    const data = await res.json()
    if (!res.ok) { setError(data.detail ?? 'Failed'); toast.error(data.detail ?? 'Failed'); return }
    setIps((p) => [...p, data].sort((a, b) => a.address.localeCompare(b.address)))
    toast.ok(`Added ${data.address}`)
    setAddress(''); setSubnetId(''); setHostname(''); setDescription(''); setMac(''); setDnsName('')
  }

  const handleDelete = async (id: number, address: string) => {
    if (!(await confirmDelete(`IP address ${address}`))) return
    const r = await fetch(`${API_BASE_URL}/api/v1/ipam/addresses/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setIps((p) => p.filter((i) => i.id !== id)); toast.ok(`Deleted ${address}`) }
  }

  const filtered = filter ? ips.filter((i) => i.address.includes(filter) || (i.hostname ?? '').toLowerCase().includes(filter.toLowerCase())) : ips

  return (
    <section className="space-y-6">
      <PageHeader
        crumbs={breadcrumbsFor('/ipam/addresses')}
        title="IP Addresses"
        description="Host assignments, reservations, and scan-discovered hosts."
      />
      <FilterBar>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by IP or hostname…" className={filterInputClass()} />
      </FilterBar>
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-line bg-surface p-5 md:grid-cols-2 xl:grid-cols-3">
        <div><label className="mb-2 block text-sm font-medium text-ink">IP Address</label><input value={address} onChange={(e) => setAddress(e.target.value)} required className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 font-mono text-ink outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">Subnet</label><select value={subnetId} onChange={(e) => setSubnetId(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent"><option value="">— none —</option>{subnets.map((s) => <option key={s.id} value={s.id}>{s.cidr} – {s.name}</option>)}</select></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">Hostname</label><input value={hostname} onChange={(e) => setHostname(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">DNS name</label><input value={dnsName} onChange={(e) => setDnsName(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 font-mono text-ink outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">MAC address</label><input value={mac} onChange={(e) => setMac(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 font-mono text-ink outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-sm font-medium text-ink">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent" /></div>
        {error && <p className="md:col-span-2 xl:col-span-3 rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="md:col-span-2 xl:col-span-3 flex justify-end"><button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 font-semibold text-accent-fg transition hover:opacity-90">Add address</button></div>
      </form>
      <TableFrame>
        <Table>
          <THead>
            <tr><th className="px-4 py-3 font-medium">Address</th><th className="px-4 py-3 font-medium">Hostname</th><th className="px-4 py-3 font-medium">Subnet</th><th className="px-4 py-3 font-medium">MAC</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Last seen</th><th className="px-4 py-3" /></tr>
          </THead>
          <tbody className="divide-y divide-line bg-surface/70">
            {filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-10"><EmptyState title="No IP addresses registered yet" body="Add subnets and scan them to populate this list." /></td></tr>
              : filtered.map((ip) => (
                <tr key={ip.id} className="hover:bg-elevated/70">
                  <Td><CopyText value={ip.address} label="IP address" className="font-semibold text-ink" /></Td>
                  <Td className="text-ink">{ip.hostname ?? '—'}</Td>
                  <Td className="font-mono text-muted">{subnetLabel(ip.subnet_id)}</Td>
                  <Td>{ip.mac_address ? <CopyText value={ip.mac_address} label="MAC" className="text-muted" /> : <span className="text-faint">—</span>}</Td>
                  <Td><StatusBadge status={ip.status} /></Td>
                  <Td className="text-muted"><RelativeTime value={ip.last_seen_at} /></Td>
                  <Td className="text-right"><button onClick={() => handleDelete(ip.id, ip.address)} className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-1 text-xs text-danger hover:bg-danger/20">Delete</button></Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </TableFrame>
    </section>
  )
}
