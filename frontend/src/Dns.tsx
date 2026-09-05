import { FormEvent, useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from './apiBase'
import { Alert, PageHeader, btnDanger, btnPrimary, btnSecondary, cardClass, fieldClass, labelClass, tableWrapClass } from './ui'

function authHeaders() {
  const token = localStorage.getItem('nexusops_token') ?? ''
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// ── types ──────────────────────────────────────────────────────────────────

export type DnsRecord = {
  id: number; zone_id: number; name: string; record_type: string
  value: string; ttl: number | null; priority: number | null
  comment: string | null; created_at: string; updated_at: string
}
export type DnsZone = {
  id: number; name: string; kind: string; description: string | null
  default_ttl: number; status: string; records: DnsRecord[]
  cloud_account_id: number | null
  cloudflare_zone_id: string | null
  last_sync_at: string | null
  last_sync_direction: string | null
  last_sync_status: string | null
  last_sync_error: string | null
  created_at: string; updated_at: string
}
export type DnsCloudAccount = {
  id: number; name: string; provider: string; has_token: boolean
  last_test_status: string | null; last_test_error: string | null
}
export type DnsCloudZone = { id: string; name: string; status: string; imported: boolean }

// ── helpers ─────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  A:     'bg-indigo-500/15 text-indigo-300',
  AAAA:  'bg-sky-500/15 text-sky-300',
  CNAME: 'bg-violet-500/15 text-violet-300',
  MX:    'bg-amber-500/15 text-amber-300',
  TXT:   'bg-slate-700 text-slate-300',
  PTR:   'bg-emerald-500/15 text-emerald-300',
  NS:    'bg-indigo-500/15 text-indigo-300',
  SRV:   'bg-rose-500/15 text-rose-300',
  SOA:   'bg-orange-500/15 text-orange-300',
  CAA:   'bg-pink-500/15 text-pink-300',
}

function TypeBadge({ type }: { type: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TYPE_BADGE[type] ?? 'bg-slate-700 text-slate-300'}`}>{type}</span>
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  inactive: 'bg-slate-700 text-slate-400 border-slate-600',
}

const input = fieldClass
const label = labelClass
const card = cardClass

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'PTR', 'NS', 'SRV', 'SOA', 'CAA']

// ── DNS overview ────────────────────────────────────────────────────────────

export function DnsOverview() {
  const [zones, setZones] = useState<DnsZone[]>([])
  const [selectedZone, setSelectedZone] = useState<DnsZone | null>(null)
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [typeFilter, setTypeFilter] = useState('')
  const [recordSearch, setRecordSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  // zone form
  const [showZoneForm, setShowZoneForm] = useState(false)
  const [zoneName, setZoneName] = useState('')
  const [zoneKind, setZoneKind] = useState('forward')
  const [zoneDesc, setZoneDesc] = useState('')
  const [zoneTtl, setZoneTtl] = useState('300')
  const [zoneError, setZoneError] = useState('')

  // record form
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [recName, setRecName] = useState('')
  const [recType, setRecType] = useState('A')
  const [recValue, setRecValue] = useState('')
  const [recTtl, setRecTtl] = useState('')
  const [recPriority, setRecPriority] = useState('')
  const [recComment, setRecComment] = useState('')
  const [recError, setRecError] = useState('')

  const [cfAccounts, setCfAccounts] = useState<DnsCloudAccount[]>([])
  const [cfZones, setCfZones] = useState<DnsCloudZone[]>([])
  const [cfName, setCfName] = useState('Cloudflare')
  const [cfToken, setCfToken] = useState('')
  const [cfErr, setCfErr] = useState('')
  const [cfNotice, setCfNotice] = useState('')
  const [cfBusy, setCfBusy] = useState(false)

  const loadZones = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/dns/zones`, { headers: authHeaders() })
      .then((r) => r.json()).then(setZones).catch(() => undefined)
  }, [])

  const loadCf = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/dns/cloudflare/accounts`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : []
        setCfAccounts(list)
        const first = list[0]
        if (!first) { setCfZones([]); return }
        fetch(`${API_BASE_URL}/api/v1/dns/cloudflare/accounts/${first.id}/zones`, { headers: authHeaders() })
          .then((zr) => zr.json()).then((zones) => setCfZones(Array.isArray(zones) ? zones : [])).catch(() => setCfZones([]))
      }).catch(() => undefined)
  }, [])

  const loadRecords = useCallback((zoneId: number) => {
    fetch(`${API_BASE_URL}/api/v1/dns/zones/${zoneId}/records`, { headers: authHeaders() })
      .then((r) => r.json()).then(setRecords).catch(() => undefined)
  }, [])

  useEffect(() => { loadZones(); loadCf() }, [loadZones, loadCf])

  useEffect(() => {
    if (selectedZone) loadRecords(selectedZone.id)
  }, [selectedZone, loadRecords])

  const handleSelectZone = (zone: DnsZone) => {
    setSelectedZone(zone); setTypeFilter(''); setRecordSearch(''); setShowRecordForm(false)
  }

  const handleCreateZone = async (e: FormEvent) => {
    e.preventDefault(); setZoneError('')
    const r = await fetch(`${API_BASE_URL}/api/v1/dns/zones`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: zoneName, kind: zoneKind, description: zoneDesc || null, default_ttl: Number(zoneTtl) || 300, status: 'active' }),
    })
    const data = await r.json()
    if (!r.ok) { setZoneError(data.detail ?? 'Failed'); return }
    setZones((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)))
    setZoneName(''); setZoneDesc(''); setZoneTtl('300'); setShowZoneForm(false)
  }

  const handleDeleteZone = async (id: number) => {
    const r = await fetch(`${API_BASE_URL}/api/v1/dns/zones/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) {
      setZones((p) => p.filter((z) => z.id !== id))
      if (selectedZone?.id === id) { setSelectedZone(null); setRecords([]) }
    }
  }

  const handleCreateRecord = async (e: FormEvent) => {
    if (!selectedZone) return
    e.preventDefault(); setRecError('')
    const r = await fetch(`${API_BASE_URL}/api/v1/dns/zones/${selectedZone.id}/records`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: recName, record_type: recType, value: recValue, ttl: recTtl ? Number(recTtl) : null, priority: recPriority ? Number(recPriority) : null, comment: recComment || null }),
    })
    const data = await r.json()
    if (!r.ok) { setRecError(data.detail ?? 'Failed'); return }
    setRecords((p) => [...p, data])
    setRecName(''); setRecValue(''); setRecTtl(''); setRecPriority(''); setRecComment(''); setShowRecordForm(false)
  }

  const handleDeleteRecord = async (recId: number) => {
    if (!selectedZone) return
    const r = await fetch(`${API_BASE_URL}/api/v1/dns/zones/${selectedZone.id}/records/${recId}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) setRecords((p) => p.filter((rec) => rec.id !== recId))
  }

  const account = cfAccounts[0]

  const saveCloudflare = async (e: FormEvent) => {
    e.preventDefault(); setCfErr(''); setCfNotice('')
    if (!cfToken.trim()) { setCfErr('Paste a Cloudflare API token with Zone.DNS Read and Edit'); return }
    setCfBusy(true)
    const r = await fetch(`${API_BASE_URL}/api/v1/dns/cloudflare/accounts${account ? `/${account.id}` : ''}`, {
      method: account ? 'PATCH' : 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: cfName || 'Cloudflare', api_token: cfToken.trim() }),
    })
    const data = await r.json().catch(() => ({}))
    setCfBusy(false)
    if (!r.ok) { setCfErr(typeof data.detail === 'string' ? data.detail : 'Cloudflare token was rejected'); return }
    setCfToken('')
    setCfNotice('Token saved on the server. It is not shown again.')
    loadCf(); loadZones()
  }

  const importCfZone = async (zoneId: string) => {
    if (!account) return
    setCfBusy(true); setCfErr(''); setCfNotice('')
    const r = await fetch(`${API_BASE_URL}/api/v1/dns/cloudflare/accounts/${account.id}/import`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ cloudflare_zone_id: zoneId }),
    })
    const data = await r.json().catch(() => ({}))
    setCfBusy(false)
    if (!r.ok) { setCfErr(typeof data.detail === 'string' ? data.detail : 'Import failed'); return }
    setCfNotice(`Imported ${data.name}`)
    loadZones(); loadCf()
    if (data.id) { setSelectedZone(data); loadRecords(data.id) }
  }

  const syncZone = async (direction: 'pull' | 'push') => {
    if (!selectedZone) return
    setCfBusy(true); setCfErr(''); setCfNotice('')
    let zoneId = selectedZone.id
    if (!selectedZone.cloudflare_zone_id && account) {
      const link = await fetch(`${API_BASE_URL}/api/v1/dns/zones/${selectedZone.id}/cloudflare/link`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ account_id: account.id }),
      })
      const linked = await link.json().catch(() => ({}))
      if (!link.ok) { setCfBusy(false); setCfErr(typeof linked.detail === 'string' ? linked.detail : 'Could not link zone'); return }
      setSelectedZone(linked)
      zoneId = linked.id
    }
    const r = await fetch(`${API_BASE_URL}/api/v1/dns/zones/${zoneId}/cloudflare/${direction}`, { method: 'POST', headers: authHeaders() })
    const data = await r.json().catch(() => ({}))
    setCfBusy(false)
    if (!r.ok) { setCfErr(typeof data.detail === 'string' ? data.detail : 'Sync failed'); return }
    setCfNotice(data.message || `${direction} finished (${data.created} new, ${data.updated} updated)`)
    loadZones(); loadRecords(zoneId)
  }

  const handleImport = async () => {
    if (!selectedZone || selectedZone.kind !== 'forward') return
    setImporting(true); setImportMsg('')
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/dns/zones/${selectedZone.id}/import-from-ipam`, { method: 'POST', headers: authHeaders() })
      const data = await r.json()
      setImportMsg(`${data.imported} A record${data.imported !== 1 ? 's' : ''} imported`)
      loadRecords(selectedZone.id)
    } catch { setImportMsg('Import failed') }
    finally { setImporting(false) }
  }

  const filteredRecords = records.filter((rec) => {
    const matchType = !typeFilter || rec.record_type === typeFilter
    const q = recordSearch.toLowerCase()
    const matchSearch = !q || rec.name.toLowerCase().includes(q) || rec.value.toLowerCase().includes(q)
    return matchType && matchSearch
  })

  const typeCounts = RECORD_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = records.filter((r) => r.record_type === t).length
    return acc
  }, {})

  return (
    <section className="space-y-6">
      <PageHeader title="DNS" description="Local add/delete is pushed to Cloudflare immediately when a zone is linked. A full pull-then-push runs daily at 03:00 UTC. The API token stays on the server." />

      <form onSubmit={saveCloudflare} className={`${card} grid gap-3 md:grid-cols-[1fr_1fr_auto]`}>
        <div className="md:col-span-2 xl:col-span-3 text-sm text-slate-300">
          Connect Cloudflare with a token scoped to <span className="text-white">Zone → DNS → Read</span> and <span className="text-white">Edit</span> (and Zone → Zone → Read). NexusOps encrypts it at rest.
        </div>
        <div><label className={label}>Account name</label><input value={cfName} onChange={(e) => setCfName(e.target.value)} className={input} /></div>
        <div><label className={label}>{account?.has_token ? 'Replace API token' : 'Cloudflare API token'}</label>
          <input type="password" value={cfToken} onChange={(e) => setCfToken(e.target.value)} autoComplete="off" placeholder={account?.has_token ? '••••••••  (saved, encrypted)' : 'Create token at dash.cloudflare.com'} className={input} />
        </div>
        <div className="flex items-end"><button type="submit" disabled={cfBusy} className={btnPrimary}>{account ? 'Update token' : 'Save token'}</button></div>
        {cfErr && <div className="md:col-span-3"><Alert>{cfErr}</Alert></div>}
        {cfNotice && <div className="md:col-span-3"><Alert tone="success">{cfNotice}</Alert></div>}
        {cfZones.length > 0 && (
          <div className="md:col-span-3 flex flex-wrap gap-2">
            {cfZones.map((z) => (
              <button key={z.id} type="button" disabled={cfBusy || z.imported} onClick={() => void importCfZone(z.id)} className={btnSecondary + ' text-xs'}>
                {z.imported ? `${z.name} (local)` : `Import ${z.name}`}
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* zone list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">Zones</h3>
            <button onClick={() => setShowZoneForm((p) => !p)} className={btnPrimary + ' px-3 py-1.5 text-xs'}>
              {showZoneForm ? '✕' : '+ Zone'}
            </button>
          </div>

          {showZoneForm && (
            <form onSubmit={handleCreateZone} className={`${card} space-y-3`}>
              <div><label className={label}>Zone name</label><input value={zoneName} onChange={(e) => setZoneName(e.target.value)} required placeholder="homelab.local" className={input} /></div>
              <div><label className={label}>Type</label>
                <select value={zoneKind} onChange={(e) => setZoneKind(e.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20">
                  <option value="forward">Forward</option><option value="reverse">Reverse</option>
                </select>
              </div>
              <div><label className={label}>Default TTL (s)</label><input type="number" value={zoneTtl} onChange={(e) => setZoneTtl(e.target.value)} className={input} /></div>
              <div><label className={label}>Description</label><input value={zoneDesc} onChange={(e) => setZoneDesc(e.target.value)} className={input} /></div>
              {zoneError && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{zoneError}</p>}
              <button type="submit" className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500">Create zone</button>
            </form>
          )}

          <div className="space-y-2">
            {zones.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-[#151b24] p-4 text-center text-sm text-slate-500">No zones yet.</p>
            ) : zones.map((z) => (
              <button key={z.id} onClick={() => handleSelectZone(z)}
                className={`group w-full rounded-xl border p-3 text-left transition ${selectedZone?.id === z.id ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-white/10 bg-[#151b24] hover:border-white/20'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-white">{z.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteZone(z.id) }} className="hidden rounded-lg px-1.5 py-0.5 text-[11px] text-rose-400 hover:bg-rose-500/10 group-hover:block">✕</button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[z.status] ?? 'bg-slate-700 text-slate-300'}`}>{z.status}</span>
                  <span className="text-[11px] text-slate-400">{z.kind} · {(z.records ?? []).length} records</span>
                  {z.cloudflare_zone_id && <span className="rounded-md bg-orange-500/15 px-2 py-0.5 text-[10px] text-orange-300">Cloudflare</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* records panel */}
        <div className="space-y-4">
          {!selectedZone ? (
            <div className={`${card} flex items-center justify-center py-16 text-slate-400`}>Select a zone to view and manage its records.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-mono text-xl font-bold text-white">{selectedZone.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    TTL default: {selectedZone.default_ttl}s · {selectedZone.kind} zone · {records.length} records
                    {selectedZone.last_sync_at ? ` · last ${selectedZone.last_sync_direction || 'sync'} ${selectedZone.last_sync_status || ''}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {account && (
                    <>
                      <button type="button" disabled={cfBusy} onClick={() => void syncZone('pull')} className={btnSecondary + ' text-xs'}>{cfBusy ? 'Syncing…' : '↓ Pull from Cloudflare'}</button>
                      <button type="button" disabled={cfBusy} onClick={() => void syncZone('push')} className={btnSecondary + ' text-xs'}>↑ Push to Cloudflare</button>
                    </>
                  )}
                  {selectedZone.kind === 'forward' && (
                    <button onClick={handleImport} disabled={importing} className={btnSecondary + ' text-xs'}>
                      {importing ? 'Importing…' : '⟳ Import A from IPAM'}
                    </button>
                  )}
                  <button onClick={() => setShowRecordForm((p) => !p)} className={btnPrimary}>
                    {showRecordForm ? '✕ Cancel' : '+ Record'}
                  </button>
                </div>
              </div>

              {importMsg && <p className={`rounded-lg px-3 py-2 text-sm ${importMsg.includes('failed') ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{importMsg}</p>}

              {/* type summary badges */}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setTypeFilter('')} className={`rounded-full px-3 py-1 text-xs font-medium transition ${!typeFilter ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>All {records.length}</button>
                {RECORD_TYPES.filter((t) => typeCounts[t] > 0).map((t) => (
                  <button key={t} onClick={() => setTypeFilter(typeFilter === t ? '' : t)} className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${typeFilter === t ? (TYPE_BADGE[t] ?? '') : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    {t} {typeCounts[t]}
                  </button>
                ))}
              </div>

              {showRecordForm && (
                <form onSubmit={handleCreateRecord} className={`${card} grid gap-3 md:grid-cols-2 xl:grid-cols-3`}>
                  <div><label className={label}>Name (@ for apex)</label><input value={recName} onChange={(e) => setRecName(e.target.value)} required placeholder="www" className={`${input} font-mono`} /></div>
                  <div><label className={label}>Type</label>
                    <select value={recType} onChange={(e) => setRecType(e.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2.5 font-semibold text-sm text-slate-100 outline-none focus:border-indigo-400">
                      {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={label}>Value</label><input value={recValue} onChange={(e) => setRecValue(e.target.value)} required placeholder="192.168.1.10" className={`${input} font-mono`} /></div>
                  <div><label className={label}>TTL (s, blank = zone default)</label><input type="number" value={recTtl} onChange={(e) => setRecTtl(e.target.value)} placeholder={String(selectedZone.default_ttl)} className={input} /></div>
                  {(recType === 'MX' || recType === 'SRV') && (
                    <div><label className={label}>Priority</label><input type="number" value={recPriority} onChange={(e) => setRecPriority(e.target.value)} className={input} /></div>
                  )}
                  <div><label className={label}>Comment</label><input value={recComment} onChange={(e) => setRecComment(e.target.value)} className={input} /></div>
                  {recError && <p className="md:col-span-2 xl:col-span-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{recError}</p>}
                  <div className="md:col-span-2 xl:col-span-3 flex justify-end">
                    <button type="submit" className={btnPrimary}>Add record</button>
                  </div>
                </form>
              )}

              <div className="flex gap-3">
                <input value={recordSearch} onChange={(e) => setRecordSearch(e.target.value)} placeholder="Search name or value…" className="flex-1 rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400" />
              </div>

              <div className={tableWrapClass}>
                <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                  <thead className="bg-[#0b1220] text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Value</th><th className="px-4 py-3 font-medium">TTL</th><th className="px-4 py-3 font-medium">Priority</th><th className="px-4 py-3 font-medium">Comment</th><th className="px-4 py-3" /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {filteredRecords.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                        {records.length === 0 ? 'No records yet. Add one or import A records from IPAM.' : 'No records match the filter.'}
                      </td></tr>
                    ) : filteredRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-mono font-semibold text-white">{rec.name}</td>
                        <td className="px-4 py-3"><TypeBadge type={rec.record_type} /></td>
                        <td className="px-4 py-3 max-w-[240px] truncate font-mono text-slate-200" title={rec.value}>{rec.value}</td>
                        <td className="px-4 py-3 font-mono text-slate-400">{rec.ttl ?? `${selectedZone.default_ttl}*`}</td>
                        <td className="px-4 py-3 text-slate-400">{rec.priority ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-400">{rec.comment ?? '—'}</td>
                        <td className="px-4 py-3 text-right"><button onClick={() => handleDeleteRecord(rec.id)} className={btnDanger}>Delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
