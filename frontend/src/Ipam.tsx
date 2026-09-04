import { FormEvent, useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from './apiBase'
import { formatApiDetail, isLanDiscovery } from './ipamDiscover'

function authHeaders() {
  const token = localStorage.getItem('nexusops_token') ?? ''
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// ── types ──────────────────────────────────────────────────────────────────

export type VLan = { id: number; vid: number; name: string; description: string | null; status: string }
export type Subnet = { id: number; cidr: string; name: string; description: string | null; gateway: string | null; vlan_id: number | null; status: string }
export type IPAddress = { id: number; address: string; subnet_id: number | null; hostname: string | null; description: string | null; status: string; dns_name: string | null; mac_address: string | null; last_seen_at: string | null }
export type SubnetUtil = { subnet_id: number; cidr: string; total: number; used: number; available: number; percent_used: number }
export type DiscoveredNetwork = { cidr: string; interface: string }

// ── shared helpers ──────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  reserved: 'bg-amber-500/15 text-amber-300',
  deprecated: 'bg-slate-700 text-slate-400',
  available: 'bg-cyan-500/15 text-cyan-300',
  assigned: 'bg-violet-500/15 text-violet-300',
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_BADGE[status] ?? 'bg-slate-700 text-slate-300'}`}>{status}</span>
}

function UtilBar({ util }: { util: SubnetUtil }) {
  const pct = Math.min(util.percent_used, 100)
  const color = pct > 85 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-400'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-slate-300">
        <span>{util.used} used / {util.total} total</span>
        <span className="font-semibold text-white">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-cyan-400">{util.available} available</div>
    </div>
  )
}

// ── Network overview (discovery + utilization) ─────────────────────────────

export function NetworkOverview() {
  const [subnets, setSubnets] = useState<Subnet[]>([])
  const [utils, setUtils] = useState<Record<number, SubnetUtil>>({})
  const [scanStates, setScanStates] = useState<Record<number, string>>({})
  const [discovered, setDiscovered] = useState<DiscoveredNetwork[]>([])
  const [discovering, setDiscovering] = useState(false)

  // quick-add form
  const [quickCidr, setQuickCidr] = useState('')
  const [quickName, setQuickName] = useState('')
  const [quickGateway, setQuickGateway] = useState('')
  const [quickError, setQuickError] = useState('')
  const [quickAdding, setQuickAdding] = useState(false)

  const loadUtil = useCallback((s: Subnet) => {
    fetch(`${API_BASE_URL}/api/v1/ipam/subnets/${s.id}/utilization`, { headers: authHeaders() })
      .then((r) => r.json()).then((u: SubnetUtil) => setUtils((prev) => ({ ...prev, [s.id]: u }))).catch(() => undefined)
  }, [])

  const loadAll = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/ipam/subnets`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: Subnet[]) => { setSubnets(data); data.forEach(loadUtil) })
      .catch(() => undefined)
  }, [loadUtil])

  useEffect(() => { loadAll() }, [loadAll])

  const handleScan = async (subnetId: number) => {
    setScanStates((p) => ({ ...p, [subnetId]: 'scanning' }))
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ipam/subnets/${subnetId}/scan`, { method: 'POST', headers: authHeaders() })
      const { task_id } = await r.json()
      const poll = setInterval(async () => {
        const sr = await fetch(`${API_BASE_URL}/api/v1/ipam/scan/${task_id}`, { headers: authHeaders() })
        const s = await sr.json()
        if (s.status === 'SUCCESS' || s.status === 'FAILURE') {
          clearInterval(poll)
          setScanStates((p) => ({ ...p, [subnetId]: s.status === 'SUCCESS' ? `done – ${s.result?.added ?? 0} added, ${s.result?.updated ?? 0} updated` : 'scan error' }))
          loadAll()
        }
      }, 2000)
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

  useEffect(() => {
    const lan = discovered.find(isLanDiscovery)
    if (lan) {
      setQuickCidr((current) => current || lan.cidr)
    }
  }, [discovered])

  const handleQuickAdd = async (e: FormEvent, prefillCidr?: string) => {
    e.preventDefault()
    const cidr = (prefillCidr ?? quickCidr).trim()
    const name = (prefillCidr ? cidr : (quickName || cidr)).trim()
    if (!cidr) return
    setQuickAdding(true); setQuickError('')
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ipam/subnets`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          cidr,
          name: name || cidr,
          gateway: prefillCidr ? null : (quickGateway || null),
          status: 'active',
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setQuickError(formatApiDetail(data.detail)); return }
      setSubnets((p) => [...p, data].sort((a, b) => a.cidr.localeCompare(b.cidr)))
      loadUtil(data)
      setQuickCidr(''); setQuickName(''); setQuickGateway('')
      // auto-kick scan
      const sr = await fetch(`${API_BASE_URL}/api/v1/ipam/subnets/${data.id}/scan`, { method: 'POST', headers: authHeaders() })
      const { task_id } = await sr.json()
      setScanStates((p) => ({ ...p, [data.id]: 'scanning' }))
      const poll = setInterval(async () => {
        const res = await fetch(`${API_BASE_URL}/api/v1/ipam/scan/${task_id}`, { headers: authHeaders() })
        const s = await res.json()
        if (s.status === 'SUCCESS' || s.status === 'FAILURE') {
          clearInterval(poll)
          setScanStates((p) => ({ ...p, [data.id]: s.status === 'SUCCESS' ? `done – ${s.result?.added ?? 0} added` : 'scan error' }))
          loadAll()
        }
      }, 2000)
    } catch {
      setQuickError('Request failed')
    } finally {
      setQuickAdding(false)
    }
  }

  const configuredNets = discovered.filter(isLanDiscovery)
  const containerNets = discovered.filter((d) => !isLanDiscovery(d))

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Network / IPAM</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Network overview</h2>
          <p className="mt-2 text-slate-300">Add your LAN subnets, scan them to discover live hosts, and track IP utilization.</p>
        </div>
        <button onClick={handleDiscover} disabled={discovering} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-60">
          {discovering ? '⟳ Scanning for networks…' : '⟳ Re-detect networks'}
        </button>
      </div>

      {/* Quick add + scan */}
      <form onSubmit={handleQuickAdd} className="rounded-[26px] border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 to-slate-900 p-5">
        <div className="mb-4">
          <p className="text-sm font-semibold text-white">Add LAN subnet &amp; scan</p>
          <p className="mt-1 text-[12px] text-slate-400">Enter any subnet from your homelab. NexusOps will register it and immediately run a host discovery scan.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-slate-400">CIDR</label>
            <input value={quickCidr} onChange={(e) => setQuickCidr(e.target.value)} required placeholder="e.g. 192.168.1.0/24" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-slate-100 outline-none focus:border-cyan-400" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-slate-400">Name (optional)</label>
            <input value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="e.g. Home LAN" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.15em] text-slate-400">Gateway (optional)</label>
            <input value={quickGateway} onChange={(e) => setQuickGateway(e.target.value)} placeholder="e.g. 192.168.1.1" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-slate-100 outline-none focus:border-cyan-400" />
          </div>
          <button type="submit" disabled={quickAdding} className="h-[46px] rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-60">
            {quickAdding ? 'Adding…' : '+ Add & Scan'}
          </button>
        </div>
        {quickError && <p className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{quickError}</p>}
      </form>

      {/* Discovered networks panel */}
      {discovered.length > 0 && (
        <div className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 space-y-4">
          {configuredNets.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-emerald-300">Auto-detected LAN networks (reachable via gateway probe)</p>
              <p className="mb-3 text-[11px] text-slate-400">These subnets responded during gateway probing. Click any one to register it and start a host discovery scan.</p>
              <div className="flex flex-wrap gap-3">
                {configuredNets.map((n) => (
                  <form key={n.cidr} onSubmit={(e) => handleQuickAdd(e, n.cidr)}>
                    <button type="submit" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-slate-950/60 px-3 py-2 text-sm transition hover:border-cyan-400">
                      <span className="font-mono font-semibold text-white">{n.cidr}</span>
                      <span className="text-[11px] text-slate-400">click to add &amp; scan →</span>
                    </button>
                  </form>
                ))}
              </div>
            </div>
          )}
          {containerNets.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-400">Container interfaces (Docker bridge — not your LAN)</p>
              <p className="mb-3 text-[11px] text-slate-400">These are this container’s own networks. Click one only if you really want to register it.</p>
              <div className="flex flex-wrap gap-3">
                {containerNets.map((n) => (
                  <form key={n.cidr} onSubmit={(e) => handleQuickAdd(e, n.cidr)}>
                    <button type="submit" className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm transition hover:border-cyan-400">
                      <span className="font-mono font-semibold text-slate-300">{n.cidr}</span>
                      <span className="text-slate-500">{n.interface}</span>
                    </button>
                  </form>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-500">To always show specific subnets here, add <code className="rounded bg-slate-800 px-1 py-0.5 text-cyan-300">SCAN_NETWORKS=192.168.1.0/24</code> to your <code className="rounded bg-slate-800 px-1 py-0.5 text-cyan-300">.env</code> and restart.</p>
            </div>
          )}
        </div>
      )}

      {/* Subnet utilization cards */}
      {subnets.length === 0 ? (
        <div className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-10 text-center text-slate-400">
          No subnets yet. Use the form above to add your first LAN subnet.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {subnets.map((s) => {
            const u = utils[s.id]
            const sc = scanStates[s.id]
            return (
              <div key={s.id} className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-lg font-bold text-white">{s.cidr}</div>
                    <div className="mt-0.5 text-sm text-slate-300">{s.name}</div>
                    {s.gateway && <div className="mt-1 font-mono text-[11px] text-slate-400">GW {s.gateway}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={s.status} />
                    <button onClick={() => handleScan(s.id)} disabled={sc === 'scanning'} className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-60">
                      {sc === 'scanning' ? '⟳ Scanning…' : '⟳ Scan'}
                    </button>
                  </div>
                </div>
                <div className="mt-4">{u ? <UtilBar util={u} /> : <div className="h-2 w-full animate-pulse rounded-full bg-slate-800" />}</div>
                {sc && sc !== 'scanning' && (
                  <p className={`mt-3 rounded-xl px-3 py-2 text-[11px] ${sc.startsWith('done') ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{sc}</p>
                )}
              </div>
            )
          })}
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
    if (!res.ok) { setError(data.detail ?? 'Failed'); return }
    setVlans((p) => [...p, data].sort((a, b) => a.vid - b.vid))
    setVid(''); setName(''); setDescription('')
  }

  const handleDelete = async (id: number) => {
    const r = await fetch(`${API_BASE_URL}/api/v1/ipam/vlans/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) setVlans((p) => p.filter((v) => v.id !== id))
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Network / IPAM</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">VLANs</h2>
        <p className="mt-2 text-slate-300">802.1Q VLAN registry for your network segments.</p>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 md:grid-cols-3">
        <div><label className="mb-2 block text-sm font-medium text-slate-200">VLAN ID (1–4094)</label><input type="number" min={1} max={4094} value={vid} onChange={(e) => setVid(e.target.value)} required className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">Name</label><input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400" /></div>
        {error && <p className="md:col-span-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <div className="md:col-span-3 flex justify-end"><button type="submit" className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:brightness-110">Add VLAN</button></div>
      </form>
      <div className="overflow-hidden rounded-[26px] border border-slate-800 bg-slate-900/80">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/80 text-slate-300"><tr><th className="px-4 py-3 font-medium">VID</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {vlans.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No VLANs defined yet.</td></tr>
              : vlans.map((v) => (
                <tr key={v.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-4 font-mono font-semibold text-white">{v.vid}</td>
                  <td className="px-4 py-4 text-white">{v.name}</td>
                  <td className="px-4 py-4 text-slate-300">{v.description ?? '—'}</td>
                  <td className="px-4 py-4"><StatusBadge status={v.status} /></td>
                  <td className="px-4 py-4 text-right"><button onClick={() => handleDelete(v.id)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20">Delete</button></td>
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
    if (!res.ok) { setError(data.detail ?? 'Failed'); return }
    setSubnets((p) => [...p, data].sort((a, b) => a.cidr.localeCompare(b.cidr)))
    loadUtil(data)
    setCidr(''); setName(''); setGateway(''); setVlanId(''); setDescription('')
  }

  const handleDelete = async (id: number) => {
    const r = await fetch(`${API_BASE_URL}/api/v1/ipam/subnets/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) setSubnets((p) => p.filter((s) => s.id !== id))
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Network / IPAM</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Subnets</h2>
        <p className="mt-2 text-slate-300">Add your LAN prefixes here. After adding a subnet, head to Network Overview to scan it.</p>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 md:grid-cols-2 xl:grid-cols-3">
        <div><label className="mb-2 block text-sm font-medium text-slate-200">CIDR (e.g. 192.168.10.0/24)</label><input value={cidr} onChange={(e) => setCidr(e.target.value)} required className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-slate-100 outline-none focus:border-cyan-400" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">Name</label><input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">Gateway</label><input value={gateway} onChange={(e) => setGateway(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-slate-100 outline-none focus:border-cyan-400" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">VLAN</label><select value={vlanId} onChange={(e) => setVlanId(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400"><option value="">— none —</option>{vlans.map((v) => <option key={v.id} value={v.id}>VLAN {v.vid} – {v.name}</option>)}</select></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400" /></div>
        {error && <p className="md:col-span-2 xl:col-span-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <div className="md:col-span-2 xl:col-span-3 flex justify-end"><button type="submit" className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:brightness-110">Add subnet</button></div>
      </form>
      <div className="overflow-x-auto rounded-[26px] border border-slate-800 bg-slate-900/80">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/80 text-slate-300">
            <tr><th className="px-4 py-3 font-medium">CIDR</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Gateway</th><th className="px-4 py-3 font-medium">VLAN</th><th className="px-4 py-3 font-medium min-w-[200px]">Utilization</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {subnets.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No subnets defined yet.</td></tr>
              : subnets.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-4 font-mono font-semibold text-white">{s.cidr}</td>
                  <td className="px-4 py-4 text-white">{s.name}</td>
                  <td className="px-4 py-4 font-mono text-slate-300">{s.gateway ?? '—'}</td>
                  <td className="px-4 py-4 text-slate-300">{vlanLabel(s.vlan_id)}</td>
                  <td className="px-4 py-4 min-w-[200px]">{utils[s.id] ? <UtilBar util={utils[s.id]} /> : <div className="h-2 w-full animate-pulse rounded-full bg-slate-800" />}</td>
                  <td className="px-4 py-4"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-4 text-right"><button onClick={() => handleDelete(s.id)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20">Delete</button></td>
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
    if (!res.ok) { setError(data.detail ?? 'Failed'); return }
    setIps((p) => [...p, data].sort((a, b) => a.address.localeCompare(b.address)))
    setAddress(''); setSubnetId(''); setHostname(''); setDescription(''); setMac(''); setDnsName('')
  }

  const handleDelete = async (id: number) => {
    const r = await fetch(`${API_BASE_URL}/api/v1/ipam/addresses/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) setIps((p) => p.filter((i) => i.id !== id))
  }

  const filtered = filter ? ips.filter((i) => i.address.includes(filter) || (i.hostname ?? '').toLowerCase().includes(filter.toLowerCase())) : ips

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Network / IPAM</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">IP Addresses</h2>
          <p className="mt-2 text-slate-300">Host assignments, reservations, and scan-discovered hosts.</p>
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by IP or hostname…" className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400 md:w-auto" />
      </div>
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 md:grid-cols-2 xl:grid-cols-3">
        <div><label className="mb-2 block text-sm font-medium text-slate-200">IP Address</label><input value={address} onChange={(e) => setAddress(e.target.value)} required className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-slate-100 outline-none focus:border-cyan-400" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">Subnet</label><select value={subnetId} onChange={(e) => setSubnetId(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400"><option value="">— none —</option>{subnets.map((s) => <option key={s.id} value={s.id}>{s.cidr} – {s.name}</option>)}</select></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">Hostname</label><input value={hostname} onChange={(e) => setHostname(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">DNS name</label><input value={dnsName} onChange={(e) => setDnsName(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-slate-100 outline-none focus:border-cyan-400" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">MAC address</label><input value={mac} onChange={(e) => setMac(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-slate-100 outline-none focus:border-cyan-400" /></div>
        <div><label className="mb-2 block text-sm font-medium text-slate-200">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400" /></div>
        {error && <p className="md:col-span-2 xl:col-span-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <div className="md:col-span-2 xl:col-span-3 flex justify-end"><button type="submit" className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:brightness-110">Add address</button></div>
      </form>
      <div className="overflow-x-auto rounded-[26px] border border-slate-800 bg-slate-900/80">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/80 text-slate-300">
            <tr><th className="px-4 py-3 font-medium">Address</th><th className="px-4 py-3 font-medium">Hostname</th><th className="px-4 py-3 font-medium">Subnet</th><th className="px-4 py-3 font-medium">MAC</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Last seen</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {filtered.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No IP addresses registered yet. Add subnets and scan them to populate this list.</td></tr>
              : filtered.map((ip) => (
                <tr key={ip.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-4 font-mono font-semibold text-white">{ip.address}</td>
                  <td className="px-4 py-4 text-slate-200">{ip.hostname ?? '—'}</td>
                  <td className="px-4 py-4 font-mono text-slate-300">{subnetLabel(ip.subnet_id)}</td>
                  <td className="px-4 py-4 font-mono text-slate-300">{ip.mac_address ?? '—'}</td>
                  <td className="px-4 py-4"><StatusBadge status={ip.status} /></td>
                  <td className="px-4 py-4 text-slate-400">{ip.last_seen_at ? new Date(ip.last_seen_at).toLocaleString() : '—'}</td>
                  <td className="px-4 py-4 text-right"><button onClick={() => handleDelete(ip.id)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20">Delete</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
