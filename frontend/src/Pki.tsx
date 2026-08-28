import { FormEvent, useCallback, useEffect, useState } from 'react'

import { API_BASE_URL, authHeaders } from './api/client'
import { confirmDelete } from './confirm'

// ── types ──────────────────────────────────────────────────────────────────

export type CA = { id: number; name: string; common_name: string; subject: string | null; is_root: boolean; status: string; expires_at: string | null; notes: string | null }
export type Cert = { id: number; ca_id: number | null; common_name: string; subject_alt_names: string | null; cert_type: string; status: string; serial_number: string | null; fingerprint: string | null; issued_to: string | null; issued_at: string | null; expires_at: string | null; revoked_at: string | null; notes: string | null; host_id: number | null }
export type ExpirySummary = { active: number; expired: number; revoked: number; expiring_30d: number; expiring_90d: number }

// ── helpers ─────────────────────────────────────────────────────────────────

const CERT_STATUS: Record<string, string> = {
  active:  'bg-emerald-500/15 text-emerald-300',
  expired: 'bg-rose-500/15 text-rose-300',
  revoked: 'bg-slate-700 text-slate-400',
  pending: 'bg-amber-500/15 text-amber-300',
}
const TYPE_BADGE: Record<string, string> = {
  server:   'bg-cyan-500/15 text-cyan-300',
  client:   'bg-violet-500/15 text-violet-300',
  wildcard: 'bg-indigo-500/15 text-indigo-300',
  email:    'bg-sky-500/15 text-sky-300',
}
function StatusPill({ s }: { s: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${CERT_STATUS[s] ?? 'bg-slate-700 text-slate-300'}`}>{s}</span>
}
function TypePill({ t }: { t: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TYPE_BADGE[t] ?? 'bg-slate-700 text-slate-300'}`}>{t}</span>
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}
function ExpiryChip({ iso }: { iso: string | null }) {
  const days = daysUntil(iso)
  if (days === null) return <span className="text-slate-500">—</span>
  const cls = days < 0 ? 'text-rose-400' : days <= 30 ? 'text-amber-400' : days <= 90 ? 'text-yellow-400' : 'text-slate-300'
  return <span className={`font-mono text-sm ${cls}`}>{days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}</span>
}

const input = 'w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-rose-400'
const lbl = 'mb-2 block text-sm font-medium text-slate-200'
const card = 'rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]'

// ── PKI main panel ─────────────────────────────────────────────────────────

export function PkiPanel() {
  const [cas, setCas] = useState<CA[]>([])
  const [certs, setCerts] = useState<Cert[]>([])
  const [summary, setSummary] = useState<ExpirySummary | null>(null)
  const [selectedCa, setSelectedCa] = useState<CA | null>(null)
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expiryFilter, setExpiryFilter] = useState('')

  // CA form
  const [showCaForm, setShowCaForm] = useState(false)
  const [caName, setCaName] = useState('')
  const [caCn, setCaCn] = useState('')
  const [caRoot, setCaRoot] = useState(true)
  const [caExpiry, setCaExpiry] = useState('')
  const [caErr, setCaErr] = useState('')

  // Cert form
  const [showCertForm, setShowCertForm] = useState(false)
  const [cCn, setCCn] = useState('')
  const [cType, setCType] = useState('server')
  const [cIssuedTo, setCIssuedTo] = useState('')
  const [cSans, setCSans] = useState('')
  const [cSerial, setCSerial] = useState('')
  const [cIssuedAt, setCIssuedAt] = useState('')
  const [cExpiresAt, setCExpiresAt] = useState('')
  const [cCaId, setCCaId] = useState('')
  const [cNotes, setCNotes] = useState('')
  const [cErr, setCErr] = useState('')

  const load = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/pki/cas`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/pki/certificates`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/pki/expiry-summary`, { headers: authHeaders() }).then((r) => r.json()),
    ]).then(([c, ce, s]) => { setCas(c); setCerts(ce); setSummary(s) }).catch(() => undefined)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreateCa = async (e: FormEvent) => {
    e.preventDefault(); setCaErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/cas`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: caName, common_name: caCn, is_root: caRoot, expires_at: caExpiry || null }) })
    const data = await r.json()
    if (!r.ok) { setCaErr(data.detail ?? 'Failed'); return }
    setCas((p) => [...p, data]); setCaName(''); setCaCn(''); setCaExpiry(''); setShowCaForm(false)
  }

  const handleDeleteCa = async (id: number, name: string) => {
    if (!confirmDelete(`certificate authority "${name}"`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/cas/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setCas((p) => p.filter((c) => c.id !== id)); if (selectedCa?.id === id) setSelectedCa(null) }
  }

  const handleCreateCert = async (e: FormEvent) => {
    e.preventDefault(); setCErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/certificates`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ common_name: cCn, cert_type: cType, issued_to: cIssuedTo || null, subject_alt_names: cSans || null, serial_number: cSerial || null, issued_at: cIssuedAt || null, expires_at: cExpiresAt || null, ca_id: cCaId ? Number(cCaId) : null, notes: cNotes || null }),
    })
    const data = await r.json()
    if (!r.ok) { setCErr(data.detail ?? 'Failed'); return }
    setCerts((p) => [...p, data]); setCCn(''); setCIssuedTo(''); setCSans(''); setCSerial(''); setCIssuedAt(''); setCExpiresAt(''); setCCaId(''); setCNotes(''); setShowCertForm(false)
    load()
  }

  const handleRevoke = async (id: number) => {
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/certificates/${id}/revoke`, { method: 'POST', headers: authHeaders() })
    if (r.ok) { setCerts((p) => p.map((c) => c.id === id ? { ...c, status: 'revoked' } : c)); load() }
  }

  const handleDeleteCert = async (id: number, name: string) => {
    if (!confirmDelete(`certificate "${name}"`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/certificates/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setCerts((p) => p.filter((c) => c.id !== id)); load() }
  }

  const filtered = certs.filter((c) => {
    const q = filter.toLowerCase()
    const matchText = !q || c.common_name.toLowerCase().includes(q) || (c.issued_to ?? '').toLowerCase().includes(q) || (c.serial_number ?? '').includes(q)
    const matchStatus = !statusFilter || c.status === statusFilter
    const matchCa = !selectedCa || c.ca_id === selectedCa.id
    const days = daysUntil(c.expires_at)
    const matchExpiry = !expiryFilter || (expiryFilter === '30' && days !== null && days <= 30 && days >= 0) || (expiryFilter === '90' && days !== null && days <= 90 && days >= 0) || (expiryFilter === 'expired' && c.status === 'expired')
    return matchText && matchStatus && matchCa && matchExpiry
  })

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">Infrastructure / PKI</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Certificate Management</h2>
        <p className="mt-2 text-slate-300">Track certificate authorities, issued certificates, and expiry across your homelab.</p>
      </div>

      {/* expiry summary */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: 'Active', value: summary.active, badge: 'bg-emerald-500/15 text-emerald-300' },
            { label: 'Expiring 30d', value: summary.expiring_30d, badge: 'bg-rose-500/15 text-rose-300' },
            { label: 'Expiring 90d', value: summary.expiring_90d, badge: 'bg-amber-500/15 text-amber-300' },
            { label: 'Expired', value: summary.expired, badge: 'bg-rose-900/40 text-rose-400' },
            { label: 'Revoked', value: summary.revoked, badge: 'bg-slate-700 text-slate-400' },
          ].map(({ label, value, badge }) => (
            <div key={label} className={`${card} flex items-center justify-between`}>
              <div><div className="text-2xl font-bold text-white">{value}</div><div className="mt-0.5 text-xs text-slate-400">{label}</div></div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badge}`}>{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* CA list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Certificate Authorities</h3>
            <button onClick={() => setShowCaForm((p) => !p)} className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110">
              {showCaForm ? '✕' : '+ CA'}
            </button>
          </div>

          {showCaForm && (
            <form onSubmit={handleCreateCa} className={`${card} space-y-3`}>
              <div><label className={lbl}>Name</label><input value={caName} onChange={(e) => setCaName(e.target.value)} required className={input} /></div>
              <div><label className={lbl}>Common name (CN)</label><input value={caCn} onChange={(e) => setCaCn(e.target.value)} required placeholder="My Homelab CA" className={input} /></div>
              <div><label className={lbl}>Expires (optional)</label><input type="datetime-local" value={caExpiry} onChange={(e) => setCaExpiry(e.target.value)} className={input} /></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={caRoot} onChange={(e) => setCaRoot(e.target.checked)} className="h-4 w-4" /><label className="text-sm text-slate-200">Root CA</label></div>
              {caErr && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{caErr}</p>}
              <button type="submit" className="w-full rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 py-2.5 text-sm font-semibold text-white transition hover:brightness-110">Add CA</button>
            </form>
          )}

          <button onClick={() => setSelectedCa(null)} className={`group w-full rounded-2xl border px-4 py-3 text-left transition ${!selectedCa ? 'border-rose-500/40 bg-rose-500/10' : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'}`}>
            <div className="text-sm font-semibold text-white">All CAs</div>
            <div className="text-[11px] text-slate-400">{certs.length} certificates total</div>
          </button>

          {cas.map((ca) => (
            <div key={ca.id} role="button" tabIndex={0} onClick={() => setSelectedCa(ca)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedCa(ca) }} className={`group w-full cursor-pointer rounded-2xl border px-4 py-3 text-left transition ${selectedCa?.id === ca.id ? 'border-rose-500/40 bg-rose-500/10' : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{ca.name}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteCa(ca.id, ca.name) }} className="hidden text-[10px] text-rose-400 group-hover:block">✕</button>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">{ca.common_name}</div>
              <div className="mt-1 flex items-center gap-2">
                <StatusPill s={ca.status} />
                {ca.expires_at && <ExpiryChip iso={ca.expires_at} />}
              </div>
            </div>
          ))}
        </div>

        {/* certs panel */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-white">
              {selectedCa ? `Certificates issued by ${selectedCa.name}` : 'All certificates'}
            </h3>
            <button onClick={() => setShowCertForm((p) => !p)} className="rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:brightness-110">
              {showCertForm ? '✕ Cancel' : '+ Certificate'}
            </button>
          </div>

          {showCertForm && (
            <form onSubmit={handleCreateCert} className={`${card} grid gap-3 md:grid-cols-2 xl:grid-cols-3`}>
              <div><label className={lbl}>Common name *</label><input value={cCn} onChange={(e) => setCCn(e.target.value)} required placeholder="server.homelab.local" className={input} /></div>
              <div><label className={lbl}>Type</label>
                <select value={cType} onChange={(e) => setCType(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-rose-400">
                  <option value="server">Server</option><option value="client">Client</option><option value="wildcard">Wildcard</option><option value="email">Email</option>
                </select>
              </div>
              <div><label className={lbl}>CA</label>
                <select value={cCaId} onChange={(e) => setCCaId(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-rose-400">
                  <option value="">— none —</option>{cas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Issued to (hostname/service)</label><input value={cIssuedTo} onChange={(e) => setCIssuedTo(e.target.value)} className={input} /></div>
              <div><label className={lbl}>SANs (comma-separated)</label><input value={cSans} onChange={(e) => setCSans(e.target.value)} placeholder="server.local,192.168.1.10" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Serial number</label><input value={cSerial} onChange={(e) => setCSerial(e.target.value)} className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Issued at</label><input type="datetime-local" value={cIssuedAt} onChange={(e) => setCIssuedAt(e.target.value)} className={input} /></div>
              <div><label className={lbl}>Expires at</label><input type="datetime-local" value={cExpiresAt} onChange={(e) => setCExpiresAt(e.target.value)} className={input} /></div>
              <div><label className={lbl}>Notes</label><input value={cNotes} onChange={(e) => setCNotes(e.target.value)} className={input} /></div>
              {cErr && <p className="md:col-span-2 xl:col-span-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{cErr}</p>}
              <div className="md:col-span-2 xl:col-span-3 flex justify-end">
                <button type="submit" className="rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-2.5 font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:brightness-110">Add certificate</button>
              </div>
            </form>
          )}

          {/* filters */}
          <div className="flex flex-wrap gap-3">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by CN, issued to, serial…" className="flex-1 min-w-[200px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-rose-400" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-rose-400">
              <option value="">All statuses</option><option value="active">Active</option><option value="expired">Expired</option><option value="revoked">Revoked</option><option value="pending">Pending</option>
            </select>
            <select value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-rose-400">
              <option value="">Any expiry</option><option value="30">Expiring ≤ 30d</option><option value="90">Expiring ≤ 90d</option><option value="expired">Already expired</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-[26px] border border-slate-800 bg-slate-900/80 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="bg-slate-950/80 text-slate-300">
                <tr><th className="px-4 py-3 font-medium">Common name</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Issued to</th><th className="px-4 py-3 font-medium">CA</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Expires</th><th className="px-4 py-3 font-medium">Days left</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    {certs.length === 0 ? 'No certificates tracked yet. Add your first certificate.' : 'No certificates match the current filter.'}
                  </td></tr>
                ) : filtered.map((cert) => {
                  const ca = cas.find((c) => c.id === cert.ca_id)
                  return (
                    <tr key={cert.id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-mono font-semibold text-white">{cert.common_name}</td>
                      <td className="px-4 py-3"><TypePill t={cert.cert_type} /></td>
                      <td className="px-4 py-3 text-slate-200">{cert.issued_to ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{ca ? ca.name : '—'}</td>
                      <td className="px-4 py-3"><StatusPill s={cert.status} /></td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{cert.expires_at ? new Date(cert.expires_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3"><ExpiryChip iso={cert.expires_at} /></td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {cert.status === 'active' && (
                          <button onClick={() => handleRevoke(cert.id)} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20">Revoke</button>
                        )}
                        <button onClick={() => handleDeleteCert(cert.id, cert.common_name)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/20">✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
