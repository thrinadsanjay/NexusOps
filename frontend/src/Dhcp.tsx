import { FormEvent, useCallback, useEffect, useState } from 'react'

import { API_BASE_URL, authHeaders } from './api/client'
import { confirmDelete } from './confirm'

// ── types ──────────────────────────────────────────────────────────────────

export type DhcpLease = {
  id: number; pool_id: number | null; ip_address: string; mac_address: string
  hostname: string | null; status: string; lease_start: string | null
  lease_end: string | null; last_seen_at: string | null
}
export type DhcpReservation = { id: number; pool_id: number; ip_address: string; mac_address: string; hostname: string | null; description: string | null }
export type DhcpPool = { id: number; server_id: number; subnet: string; range_start: string; range_end: string; gateway: string | null; dns_servers: string | null; lease_time: number; description: string | null; leases: DhcpLease[]; reservations: DhcpReservation[] }
export type DhcpServer = { id: number; name: string; host: string; description: string | null; status: string; pools: DhcpPool[] }

// ── helpers ─────────────────────────────────────────────────────────────────

const LEASE_STATUS: Record<string, string> = {
  active:   'bg-ok/15 text-ok',
  expired:  'bg-elevated text-muted',
  released: 'bg-warn/15 text-warn',
}
function LeaseBadge({ s }: { s: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${LEASE_STATUS[s] ?? 'bg-elevated text-muted'}`}>{s}</span>
}

const input = 'w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent'
const label = 'mb-2 block text-sm font-medium text-ink'
const card = 'rounded-2xl border border-line bg-surface p-5 shadow-card'

// ── DHCP main panel ────────────────────────────────────────────────────────

export function DhcpPanel() {
  const [servers, setServers] = useState<DhcpServer[]>([])
  const [selected, setSelected] = useState<DhcpServer | null>(null)
  const [selectedPool, setSelectedPool] = useState<DhcpPool | null>(null)
  const [allLeases, setAllLeases] = useState<DhcpLease[]>([])
  const [leaseFilter, setLeaseFilter] = useState('')
  const [promoting, setPromoting] = useState<number | null>(null)

  // server form
  const [showServerForm, setShowServerForm] = useState(false)
  const [svrName, setSvrName] = useState('')
  const [svrHost, setSvrHost] = useState('')
  const [svrDesc, setSvrDesc] = useState('')
  const [svrErr, setSvrErr] = useState('')

  // pool form
  const [showPoolForm, setShowPoolForm] = useState(false)
  const [pSubnet, setPSubnet] = useState('')
  const [pStart, setPStart] = useState('')
  const [pEnd, setPEnd] = useState('')
  const [pGateway, setPGateway] = useState('')
  const [pDns, setPDns] = useState('')
  const [pLease, setPLease] = useState('86400')
  const [pDesc, setPDesc] = useState('')
  const [pErr, setPErr] = useState('')

  // reservation form
  const [showResForm, setShowResForm] = useState(false)
  const [resIp, setResIp] = useState('')
  const [resMac, setResMac] = useState('')
  const [resHost, setResHost] = useState('')
  const [resDesc, setResDesc] = useState('')
  const [resErr, setResErr] = useState('')

  // lease form
  const [showLeaseForm, setShowLeaseForm] = useState(false)
  const [lIp, setLIp] = useState('')
  const [lMac, setLMac] = useState('')
  const [lHost, setLHost] = useState('')
  const [lErr, setLErr] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')

  const loadServers = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/dhcp/servers`, { headers: authHeaders() })
      .then((r) => r.json()).then(setServers).catch(() => undefined)
  }, [])

  const loadAllLeases = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/dhcp/leases?active_only=false`, { headers: authHeaders() })
      .then((r) => r.json()).then(setAllLeases).catch(() => undefined)
  }, [])

  useEffect(() => { loadServers(); loadAllLeases() }, [loadServers, loadAllLeases])

  const handleSelectServer = (svr: DhcpServer) => {
    setSelected(svr); setSelectedPool(null); setShowPoolForm(false); setShowResForm(false); setShowLeaseForm(false)
  }

  const handleSelectPool = (pool: DhcpPool) => {
    setSelectedPool(pool); setShowResForm(false); setShowLeaseForm(false)
  }

  // ── server CRUD
  const handleCreateServer = async (e: FormEvent) => {
    e.preventDefault(); setSvrErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: svrName, host: svrHost, description: svrDesc || null }) })
    const data = await r.json()
    if (!r.ok) { setSvrErr(data.detail ?? 'Failed'); return }
    setServers((p) => [...p, data]); setSvrName(''); setSvrHost(''); setSvrDesc(''); setShowServerForm(false)
  }
  const handleDeleteServer = async (id: number, name: string) => {
    if (!confirmDelete(`DHCP server "${name}"`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setServers((p) => p.filter((s) => s.id !== id)); if (selected?.id === id) { setSelected(null); setSelectedPool(null) } }
  }

  // ── pool CRUD
  const handleCreatePool = async (e: FormEvent) => {
    if (!selected) return; e.preventDefault(); setPErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${selected.id}/pools`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ subnet: pSubnet, range_start: pStart, range_end: pEnd, gateway: pGateway || null, dns_servers: pDns || null, lease_time: Number(pLease) || 86400, description: pDesc || null }) })
    const data = await r.json()
    if (!r.ok) { setPErr(data.detail ?? 'Failed'); return }
    setServers((prev) => prev.map((s) => s.id === selected.id ? { ...s, pools: [...s.pools, data] } : s))
    setSelected((s) => s ? { ...s, pools: [...s.pools, data] } : s)
    setPSubnet(''); setPStart(''); setPEnd(''); setPGateway(''); setPDns(''); setPLease('86400'); setPDesc(''); setShowPoolForm(false)
  }
  const handleDeletePool = async (poolId: number, subnet: string) => {
    if (!selected) return
    if (!confirmDelete(`DHCP pool ${subnet}`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${selected.id}/pools/${poolId}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) {
      setServers((prev) => prev.map((s) => s.id === selected.id ? { ...s, pools: s.pools.filter((p) => p.id !== poolId) } : s))
      setSelected((s) => s ? { ...s, pools: s.pools.filter((p) => p.id !== poolId) } : s)
      if (selectedPool?.id === poolId) setSelectedPool(null)
    }
  }

  // ── lease CRUD
  const refreshPool = useCallback(async (svr: DhcpServer, pool: DhcpPool) => {
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${svr.id}/pools/${pool.id}/leases`, { headers: authHeaders() })
    const leases: DhcpLease[] = await r.json()
    const rr = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${svr.id}/pools/${pool.id}/reservations`, { headers: authHeaders() })
    const reservations: DhcpReservation[] = await rr.json()
    const updated = { ...pool, leases, reservations }
    setSelectedPool(updated)
    setSelected((s) => s ? { ...s, pools: s.pools.map((p) => p.id === pool.id ? updated : p) } : s)
    loadAllLeases()
  }, [loadAllLeases])

  const handleCreateLease = async (e: FormEvent) => {
    if (!selected || !selectedPool) return; e.preventDefault(); setLErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${selected.id}/pools/${selectedPool.id}/leases`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ip_address: lIp, mac_address: lMac, hostname: lHost || null, status: 'active' }) })
    const data = await r.json()
    if (!r.ok) { setLErr(data.detail ?? 'Failed'); return }
    setLIp(''); setLMac(''); setLHost(''); setShowLeaseForm(false)
    refreshPool(selected, selectedPool)
  }
  const handleDeleteLease = async (leaseId: number, address: string) => {
    if (!selected || !selectedPool) return
    if (!confirmDelete(`lease ${address}`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${selected.id}/pools/${selectedPool.id}/leases/${leaseId}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) refreshPool(selected, selectedPool)
  }

  // ── reservation CRUD
  const handleCreateReservation = async (e: FormEvent) => {
    if (!selected || !selectedPool) return; e.preventDefault(); setResErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${selected.id}/pools/${selectedPool.id}/reservations`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ip_address: resIp, mac_address: resMac, hostname: resHost || null, description: resDesc || null }) })
    const data = await r.json()
    if (!r.ok) { setResErr(data.detail ?? 'Failed'); return }
    setResIp(''); setResMac(''); setResHost(''); setResDesc(''); setShowResForm(false)
    refreshPool(selected, selectedPool)
  }
  const handleDeleteReservation = async (resId: number, address: string) => {
    if (!selected || !selectedPool) return
    if (!confirmDelete(`reservation ${address}`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${selected.id}/pools/${selectedPool.id}/reservations/${resId}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) refreshPool(selected, selectedPool)
  }

  const handleBulkImport = async (e: FormEvent) => {
    if (!selected || !selectedPool) return
    e.preventDefault(); setBulkMsg('')
    const leases = bulkText.split('\n').map((line) => line.trim()).filter((line) => line && !line.toLowerCase().startsWith('ip')).map((line) => {
      const [ip_address, mac_address, hostname] = line.split(/[,\t;]/).map((part) => part.trim())
      return { ip_address, mac_address, hostname: hostname || null, status: 'active' }
    }).filter((item) => item.ip_address && item.mac_address)
    if (leases.length === 0) { setBulkMsg('No valid rows. Use ip,mac,hostname per line.'); return }
    const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/servers/${selected.id}/pools/${selectedPool.id}/leases/bulk`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(leases),
    })
    const data = await r.json()
    if (!r.ok) { setBulkMsg(typeof data.detail === 'string' ? data.detail : 'Import failed'); return }
    setBulkMsg(`Imported ${data.added} new and updated ${data.updated} leases`)
    setBulkText(''); setShowBulk(false)
    refreshPool(selected, selectedPool)
  }

  const handlePromote = async (leaseId: number) => {
    setPromoting(leaseId)
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/dhcp/leases/${leaseId}/promote`, { method: 'POST', headers: authHeaders() })
      if (r.ok && selected && selectedPool) refreshPool(selected, selectedPool)
    } finally { setPromoting(null) }
  }

  const filteredAllLeases = allLeases.filter((l) => {
    const q = leaseFilter.toLowerCase()
    return !q || l.ip_address.includes(q) || l.mac_address.includes(q) || (l.hostname ?? '').toLowerCase().includes(q)
  })

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Infrastructure / DHCP</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">DHCP Management</h2>
        <p className="mt-2 text-muted">Track DHCP servers, address pools, active leases, and static reservations.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* left: server + pool tree */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Servers</h3>
            <button onClick={() => setShowServerForm((p) => !p)} className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition hover:opacity-90">
              {showServerForm ? '✕' : '+ Server'}
            </button>
          </div>

          {showServerForm && (
            <form onSubmit={handleCreateServer} className={`${card} space-y-3`}>
              <div><label className={label}>Name</label><input value={svrName} onChange={(e) => setSvrName(e.target.value)} required placeholder="Home Router" className={input} /></div>
              <div><label className={label}>Host / IP</label><input value={svrHost} onChange={(e) => setSvrHost(e.target.value)} required placeholder="192.168.1.1" className={`${input} font-mono`} /></div>
              <div><label className={label}>Description</label><input value={svrDesc} onChange={(e) => setSvrDesc(e.target.value)} className={input} /></div>
              {svrErr && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{svrErr}</p>}
              <button type="submit" className="w-full rounded-2xl bg-accent py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90">Add server</button>
            </form>
          )}

          <div className="space-y-2">
            {servers.length === 0 ? (
              <p className="rounded-2xl border border-line bg-surface p-4 text-center text-sm text-muted">No DHCP servers yet.</p>
            ) : servers.map((svr) => (
              <div key={svr.id} className="rounded-2xl border border-line bg-surface">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectServer(svr)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectServer(svr) }}
                  className={`group flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-left transition ${selected?.id === svr.id ? 'bg-warn/10' : 'hover:bg-elevated/70'}`}
                >
                  <div>
                    <div className="font-semibold text-ink">{svr.name}</div>
                    <div className="font-mono text-[11px] text-muted">{svr.host}</div>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteServer(svr.id, svr.name) }} className="hidden text-xs text-danger hover:text-danger group-hover:block">✕</button>
                </div>
                {selected?.id === svr.id && (
                  <div className="border-t border-line px-3 py-2 space-y-1">
                    {svr.pools.map((pool) => (
                      <div key={pool.id} role="button" tabIndex={0} onClick={() => handleSelectPool(pool)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectPool(pool) }} className={`group flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${selectedPool?.id === pool.id ? 'bg-warn/15 text-warn' : 'text-muted hover:bg-elevated'}`}>
                        <div>
                          <div className="font-mono text-xs font-semibold">{pool.subnet}</div>
                          <div className="text-[10px] text-muted">{pool.leases.filter(l => l.status === 'active').length} active leases</div>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleDeletePool(pool.id, pool.subnet) }} className="hidden text-[10px] text-danger group-hover:block">✕</button>
                      </div>
                    ))}
                    <button onClick={() => setShowPoolForm((p) => !p)} className="mt-1 w-full rounded-xl border border-dashed border-line py-1.5 text-xs text-muted hover:border-warn/50 hover:text-warn">
                      + Add pool
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* right: pool detail */}
        <div className="space-y-4">
          {/* pool form */}
          {showPoolForm && selected && (
            <form onSubmit={handleCreatePool} className={`${card} grid gap-3 md:grid-cols-2`}>
              <div className="md:col-span-2"><p className="text-sm font-semibold text-ink">New pool on {selected.name}</p></div>
              <div><label className={label}>Subnet</label><input value={pSubnet} onChange={(e) => setPSubnet(e.target.value)} required placeholder="192.168.1.0/24" className={`${input} font-mono`} /></div>
              <div><label className={label}>Range start</label><input value={pStart} onChange={(e) => setPStart(e.target.value)} required placeholder="192.168.1.100" className={`${input} font-mono`} /></div>
              <div><label className={label}>Range end</label><input value={pEnd} onChange={(e) => setPEnd(e.target.value)} required placeholder="192.168.1.200" className={`${input} font-mono`} /></div>
              <div><label className={label}>Gateway</label><input value={pGateway} onChange={(e) => setPGateway(e.target.value)} placeholder="192.168.1.1" className={`${input} font-mono`} /></div>
              <div><label className={label}>DNS servers (comma-sep)</label><input value={pDns} onChange={(e) => setPDns(e.target.value)} placeholder="1.1.1.1,8.8.8.8" className={`${input} font-mono`} /></div>
              <div><label className={label}>Lease time (s)</label><input type="number" value={pLease} onChange={(e) => setPLease(e.target.value)} className={input} /></div>
              <div><label className={label}>Description</label><input value={pDesc} onChange={(e) => setPDesc(e.target.value)} className={input} /></div>
              {pErr && <p className="md:col-span-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{pErr}</p>}
              <div className="md:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowPoolForm(false)} className="rounded-2xl border border-line px-4 py-2.5 text-sm text-muted hover:bg-elevated">Cancel</button>
                <button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90">Create pool</button>
              </div>
            </form>
          )}

          {!selectedPool ? (
            !selected ? (
              <div className={`${card} flex items-center justify-center py-16 text-muted`}>Select a server to view its pools.</div>
            ) : (
              <div className={`${card} flex items-center justify-center py-12 text-muted`}>Select a pool to view leases and reservations.</div>
            )
          ) : (
            <>
              {/* pool summary */}
              <div className={`${card} grid gap-4 md:grid-cols-2`}>
                <div>
                  <div className="font-mono text-xl font-bold text-ink">{selectedPool.subnet}</div>
                  <div className="mt-1 text-xs text-muted">Range: {selectedPool.range_start} – {selectedPool.range_end}</div>
                  {selectedPool.gateway && <div className="font-mono text-xs text-muted">GW: {selectedPool.gateway}</div>}
                  {selectedPool.dns_servers && <div className="font-mono text-xs text-muted">DNS: {selectedPool.dns_servers}</div>}
                </div>
                <div className="flex flex-col justify-center gap-2 md:items-end">
                  <div className="flex gap-3">
                    <div className="text-center"><div className="text-2xl font-bold text-ink">{selectedPool.leases.filter(l => l.status === 'active').length}</div><div className="text-[11px] text-ok">Active leases</div></div>
                    <div className="text-center"><div className="text-2xl font-bold text-ink">{selectedPool.reservations.length}</div><div className="text-[11px] text-warn">Reservations</div></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowLeaseForm((p) => !p); setShowResForm(false); setShowBulk(false) }} className="rounded-xl border border-ok/30 bg-ok/10 px-3 py-1.5 text-xs font-medium text-ok hover:bg-ok/20">{showLeaseForm ? '✕' : '+ Lease'}</button>
                    <button onClick={() => { setShowResForm((p) => !p); setShowLeaseForm(false); setShowBulk(false) }} className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-1.5 text-xs font-medium text-warn hover:bg-warn/20">{showResForm ? '✕' : '+ Reservation'}</button>
                    <button onClick={() => { setShowBulk((p) => !p); setShowLeaseForm(false); setShowResForm(false) }} className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20">{showBulk ? '✕' : 'Import leases'}</button>
                  </div>
                </div>
              </div>

              {/* lease form */}
              {showLeaseForm && (
                <form onSubmit={handleCreateLease} className={`${card} grid gap-3 md:grid-cols-3`}>
                  <div><label className={label}>IP address</label><input value={lIp} onChange={(e) => setLIp(e.target.value)} required className={`${input} font-mono`} /></div>
                  <div><label className={label}>MAC address</label><input value={lMac} onChange={(e) => setLMac(e.target.value)} required placeholder="aa:bb:cc:dd:ee:ff" className={`${input} font-mono`} /></div>
                  <div><label className={label}>Hostname</label><input value={lHost} onChange={(e) => setLHost(e.target.value)} className={input} /></div>
                  {lErr && <p className="md:col-span-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{lErr}</p>}
                  <div className="md:col-span-3 flex justify-end"><button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90">Add lease</button></div>
                </form>
              )}

              {showBulk && (
                <form onSubmit={handleBulkImport} className={`${card} space-y-3`}>
                  <p className="text-sm font-semibold text-ink">Bulk import leases</p>
                  <p className="text-xs text-muted">One lease per line: <span className="font-mono text-muted">ip,mac,hostname</span></p>
                  <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} placeholder={'192.168.1.20,aa:bb:cc:dd:ee:01,host-20\n192.168.1.21,aa:bb:cc:dd:ee:02,host-21'} className={`${input} font-mono text-xs`} />
                  {bulkMsg && <p className={`rounded-xl px-3 py-2 text-xs ${bulkMsg.includes('fail') || bulkMsg.includes('No valid') ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'}`}>{bulkMsg}</p>}
                  <div className="flex justify-end"><button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg">Import</button></div>
                </form>
              )}

              {/* reservation form */}
              {showResForm && (
                <form onSubmit={handleCreateReservation} className={`${card} grid gap-3 md:grid-cols-2`}>
                  <div><label className={label}>IP address</label><input value={resIp} onChange={(e) => setResIp(e.target.value)} required className={`${input} font-mono`} /></div>
                  <div><label className={label}>MAC address</label><input value={resMac} onChange={(e) => setResMac(e.target.value)} required placeholder="aa:bb:cc:dd:ee:ff" className={`${input} font-mono`} /></div>
                  <div><label className={label}>Hostname</label><input value={resHost} onChange={(e) => setResHost(e.target.value)} className={input} /></div>
                  <div><label className={label}>Description</label><input value={resDesc} onChange={(e) => setResDesc(e.target.value)} className={input} /></div>
                  {resErr && <p className="md:col-span-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{resErr}</p>}
                  <div className="md:col-span-2 flex justify-end"><button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90">Add reservation</button></div>
                </form>
              )}

              {/* leases table */}
              <div className={card}>
                <h3 className="mb-4 text-base font-semibold text-ink">Active leases</h3>
                <div className="overflow-x-auto rounded-2xl border border-line">
                  <table className="min-w-full divide-y divide-line text-left text-sm">
                    <thead className="bg-canvas/80 text-muted"><tr><th className="px-3 py-3 font-medium">IP</th><th className="px-3 py-3 font-medium">MAC</th><th className="px-3 py-3 font-medium">Hostname</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Expires</th><th className="px-3 py-3" /></tr></thead>
                    <tbody className="divide-y divide-line bg-surface/70">
                      {selectedPool.leases.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">No leases.</td></tr>
                        : selectedPool.leases.map((l) => (
                          <tr key={l.id} className="hover:bg-elevated/70">
                            <td className="px-3 py-3 font-mono text-ink">{l.ip_address}</td>
                            <td className="px-3 py-3 font-mono text-muted">{l.mac_address}</td>
                            <td className="px-3 py-3 text-ink">{l.hostname ?? '—'}</td>
                            <td className="px-3 py-3"><LeaseBadge s={l.status} /></td>
                            <td className="px-3 py-3 text-[11px] text-muted">{l.lease_end ? new Date(l.lease_end).toLocaleString() : '—'}</td>
                            <td className="px-3 py-3 text-right space-x-2">
                              <button onClick={() => handlePromote(l.id)} disabled={promoting === l.id} className="rounded-xl border border-warn/30 bg-warn/10 px-2 py-1 text-[10px] text-warn hover:bg-warn/20 disabled:opacity-60">
                                {promoting === l.id ? '…' : 'Reserve'}
                              </button>
                              <button onClick={() => handleDeleteLease(l.id, l.ip_address)} className="rounded-xl border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] text-danger hover:bg-danger/20">✕</button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* reservations table */}
              <div className={card}>
                <h3 className="mb-4 text-base font-semibold text-ink">Static reservations</h3>
                <div className="overflow-x-auto rounded-2xl border border-line">
                  <table className="min-w-full divide-y divide-line text-left text-sm">
                    <thead className="bg-canvas/80 text-muted"><tr><th className="px-3 py-3 font-medium">IP</th><th className="px-3 py-3 font-medium">MAC</th><th className="px-3 py-3 font-medium">Hostname</th><th className="px-3 py-3 font-medium">Description</th><th className="px-3 py-3" /></tr></thead>
                    <tbody className="divide-y divide-line bg-surface/70">
                      {selectedPool.reservations.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">No reservations. Use "Reserve" on a lease or add one manually.</td></tr>
                        : selectedPool.reservations.map((res) => (
                          <tr key={res.id} className="hover:bg-elevated/70">
                            <td className="px-3 py-3 font-mono text-ink">{res.ip_address}</td>
                            <td className="px-3 py-3 font-mono text-muted">{res.mac_address}</td>
                            <td className="px-3 py-3 text-ink">{res.hostname ?? '—'}</td>
                            <td className="px-3 py-3 text-muted">{res.description ?? '—'}</td>
                            <td className="px-3 py-3 text-right"><button onClick={() => handleDeleteReservation(res.id, res.ip_address)} className="rounded-xl border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] text-danger hover:bg-danger/20">✕</button></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* all leases flat view */}
          {!selectedPool && (
            <div className={card}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-ink">All leases</h3>
                <input value={leaseFilter} onChange={(e) => setLeaseFilter(e.target.value)} placeholder="Filter IP, MAC, hostname…" className="w-56 rounded-2xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
              </div>
              <div className="overflow-x-auto rounded-2xl border border-line">
                <table className="min-w-full divide-y divide-line text-left text-sm">
                  <thead className="bg-canvas/80 text-muted"><tr><th className="px-3 py-3 font-medium">IP</th><th className="px-3 py-3 font-medium">MAC</th><th className="px-3 py-3 font-medium">Hostname</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Last seen</th></tr></thead>
                  <tbody className="divide-y divide-line bg-surface/70">
                    {filteredAllLeases.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-muted">{allLeases.length === 0 ? 'No leases recorded yet.' : 'No matches.'}</td></tr>
                      : filteredAllLeases.map((l) => (
                        <tr key={l.id} className="hover:bg-elevated/70">
                          <td className="px-3 py-3 font-mono text-ink">{l.ip_address}</td>
                          <td className="px-3 py-3 font-mono text-muted">{l.mac_address}</td>
                          <td className="px-3 py-3 text-ink">{l.hostname ?? '—'}</td>
                          <td className="px-3 py-3"><LeaseBadge s={l.status} /></td>
                          <td className="px-3 py-3 text-[11px] text-muted">{l.last_seen_at ? new Date(l.last_seen_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
