import { FormEvent, useCallback, useEffect, useState } from 'react'

import { API_BASE_URL, authHeaders } from './api/client'
import { confirmDelete } from './confirm'

// ── types ──────────────────────────────────────────────────────────────────

export type DnsRecord = {
  id: number; zone_id: number; name: string; record_type: string
  value: string; ttl: number | null; priority: number | null
  comment: string | null; created_at: string; updated_at: string
}
export type DnsZone = {
  id: number; name: string; kind: string; description: string | null
  default_ttl: number; status: string; records: DnsRecord[]
  created_at: string; updated_at: string
}

// ── helpers ─────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  A:     'bg-cyan-500/15 text-cyan-300',
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

const input = 'w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/20'
const label = 'mb-2 block text-sm font-medium text-slate-200'
const card = 'rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]'

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

  const loadZones = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/dns/zones`, { headers: authHeaders() })
      .then((r) => r.json()).then(setZones).catch(() => undefined)
  }, [])

  const loadRecords = useCallback((zoneId: number) => {
    fetch(`${API_BASE_URL}/api/v1/dns/zones/${zoneId}/records`, { headers: authHeaders() })
      .then((r) => r.json()).then(setRecords).catch(() => undefined)
  }, [])

  useEffect(() => { loadZones() }, [loadZones])

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

  const handleDeleteZone = async (id: number, name: string) => {
    if (!confirmDelete(`DNS zone "${name}"`)) return
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

  const handleDeleteRecord = async (recId: number, name: string) => {
    if (!confirmDelete(`DNS record "${name}"`)) return
    if (!selectedZone) return
    const r = await fetch(`${API_BASE_URL}/api/v1/dns/zones/${selectedZone.id}/records/${recId}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) setRecords((p) => p.filter((rec) => rec.id !== recId))
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
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-indigo-300">Infrastructure / DNS</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">DNS Management</h2>
        <p className="mt-2 text-slate-300">Manage zones and records for your homelab DNS infrastructure.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* zone list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">Zones</h3>
            <button onClick={() => setShowZoneForm((p) => !p)} className="rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110">
              {showZoneForm ? '✕' : '+ Zone'}
            </button>
          </div>

          {showZoneForm && (
            <form onSubmit={handleCreateZone} className={`${card} space-y-3`}>
              <div><label className={label}>Zone name</label><input value={zoneName} onChange={(e) => setZoneName(e.target.value)} required placeholder="homelab.local" className={input} /></div>
              <div><label className={label}>Type</label>
                <select value={zoneKind} onChange={(e) => setZoneKind(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400">
                  <option value="forward">Forward</option><option value="reverse">Reverse</option>
                </select>
              </div>
              <div><label className={label}>Default TTL (s)</label><input type="number" value={zoneTtl} onChange={(e) => setZoneTtl(e.target.value)} className={input} /></div>
              <div><label className={label}>Description</label><input value={zoneDesc} onChange={(e) => setZoneDesc(e.target.value)} className={input} /></div>
              {zoneError && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{zoneError}</p>}
              <button type="submit" className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110">Create zone</button>
            </form>
          )}

          <div className="space-y-2">
            {zones.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-center text-sm text-slate-400">No zones yet.</p>
            ) : zones.map((z) => (
              <div key={z.id} role="button" tabIndex={0} onClick={() => handleSelectZone(z)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectZone(z) }}
                className={`group w-full cursor-pointer rounded-2xl border p-3 text-left transition ${selectedZone?.id === z.id ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-white">{z.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteZone(z.id, z.name) }} className="hidden rounded-lg px-1.5 py-0.5 text-[11px] text-rose-400 hover:bg-rose-500/10 group-hover:block">✕</button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[z.status] ?? 'bg-slate-700 text-slate-300'}`}>{z.status}</span>
                  <span className="text-[11px] text-slate-400">{z.kind} · {z.records.length} records</span>
                </div>
              </div>
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
                  <p className="mt-0.5 text-xs text-slate-400">TTL default: {selectedZone.default_ttl}s · {selectedZone.kind} zone · {records.length} records</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedZone.kind === 'forward' && (
                    <button onClick={handleImport} disabled={importing} className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-60">
                      {importing ? 'Importing…' : '⟳ Import A from IPAM'}
                    </button>
                  )}
                  <button onClick={() => setShowRecordForm((p) => !p)} className="rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110">
                    {showRecordForm ? '✕ Cancel' : '+ Record'}
                  </button>
                </div>
              </div>

              {importMsg && <p className={`rounded-2xl px-3 py-2 text-sm ${importMsg.includes('failed') ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{importMsg}</p>}

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
                    <select value={recType} onChange={(e) => setRecType(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-bold text-slate-100 outline-none focus:border-indigo-400">
                      {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className={label}>Value</label><input value={recValue} onChange={(e) => setRecValue(e.target.value)} required placeholder="192.168.1.10" className={`${input} font-mono`} /></div>
                  <div><label className={label}>TTL (s, blank = zone default)</label><input type="number" value={recTtl} onChange={(e) => setRecTtl(e.target.value)} placeholder={String(selectedZone.default_ttl)} className={input} /></div>
                  {(recType === 'MX' || recType === 'SRV') && (
                    <div><label className={label}>Priority</label><input type="number" value={recPriority} onChange={(e) => setRecPriority(e.target.value)} className={input} /></div>
                  )}
                  <div><label className={label}>Comment</label><input value={recComment} onChange={(e) => setRecComment(e.target.value)} className={input} /></div>
                  {recError && <p className="md:col-span-2 xl:col-span-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{recError}</p>}
                  <div className="md:col-span-2 xl:col-span-3 flex justify-end">
                    <button type="submit" className="rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-2.5 font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:brightness-110">Add record</button>
                  </div>
                </form>
              )}

              <div className="flex gap-3">
                <input value={recordSearch} onChange={(e) => setRecordSearch(e.target.value)} placeholder="Search name or value…" className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400" />
              </div>

              <div className="overflow-x-auto rounded-[26px] border border-slate-800 bg-slate-900/80 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
                <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                  <thead className="bg-slate-950/80 text-slate-300">
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
                        <td className="px-4 py-3 text-right"><button onClick={() => handleDeleteRecord(rec.id, rec.name)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20">Delete</button></td>
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
