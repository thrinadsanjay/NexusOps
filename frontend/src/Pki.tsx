import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { API_BASE_URL, authHeaders } from './api/client'
import { confirmDelete } from './confirm'
import { breadcrumbsFor } from './layout/navigation'
import { CopyText } from './ui/copy'
import { EmptyState, PageHeader } from './ui/page'
import { FilterBar, SkeletonRows, Table, TableFrame, THead, Td, filterInputClass, filterSelectClass } from './ui/table'
import { RelativeTime } from './ui/time'
import { toast } from './ui/toast'

// ── types ──────────────────────────────────────────────────────────────────

export type CA = { id: number; name: string; common_name: string; subject: string | null; is_root: boolean; status: string; expires_at: string | null; notes: string | null }
export type Cert = { id: number; ca_id: number | null; common_name: string; subject_alt_names: string | null; cert_type: string; status: string; serial_number: string | null; fingerprint: string | null; issued_to: string | null; issued_at: string | null; expires_at: string | null; revoked_at: string | null; notes: string | null; host_id: number | null }
export type ExpirySummary = { active: number; expired: number; revoked: number; expiring_30d: number; expiring_90d: number }

// ── helpers ─────────────────────────────────────────────────────────────────

const CERT_STATUS: Record<string, string> = {
  active:  'bg-ok/15 text-ok',
  expired: 'bg-danger/15 text-danger',
  revoked: 'bg-elevated text-muted',
  pending: 'bg-warn/15 text-warn',
}
const TYPE_BADGE: Record<string, string> = {
  server:   'bg-accent/15 text-accent',
  client:   'bg-accent/15 text-accent',
  wildcard: 'bg-accent/15 text-accent',
  email:    'bg-accent/15 text-accent',
}
function StatusPill({ s }: { s: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${CERT_STATUS[s] ?? 'bg-elevated text-muted'}`}>{s}</span>
}
function TypePill({ t }: { t: string }) {
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TYPE_BADGE[t] ?? 'bg-elevated text-muted'}`}>{t}</span>
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}
function ExpiryChip({ iso }: { iso: string | null }) {
  const days = daysUntil(iso)
  if (days === null) return <span className="text-faint">—</span>
  const cls = days < 0 ? 'text-danger' : days <= 30 ? 'text-warn' : days <= 90 ? 'text-warn' : 'text-muted'
  return <span className={`font-mono text-sm ${cls}`}>{days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}</span>
}

const input = 'w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent'
const lbl = 'mb-2 block text-sm font-medium text-ink'
const card = 'rounded-2xl border border-line bg-surface p-5 shadow-card'

// ── PKI main panel ─────────────────────────────────────────────────────────

export function PkiPanel() {
  const [params, setParams] = useSearchParams()
  const [cas, setCas] = useState<CA[]>([])
  const [certs, setCerts] = useState<Cert[]>([])
  const [summary, setSummary] = useState<ExpirySummary | null>(null)
  const [selectedCa, setSelectedCa] = useState<CA | null>(null)
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expiryFilter, setExpiryFilter] = useState(params.get('expiry') ?? '')
  const [loading, setLoading] = useState(true)

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
    setLoading(true)
    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/pki/cas`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/pki/certificates`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/pki/expiry-summary`, { headers: authHeaders() }).then((r) => r.json()),
    ]).then(([c, ce, s]) => { setCas(Array.isArray(c) ? c : []); setCerts(Array.isArray(ce) ? ce : []); setSummary(s) })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const expiry = params.get('expiry')
    if (expiry !== null) setExpiryFilter(expiry)
  }, [params])

  const setExpiry = (value: string) => {
    setExpiryFilter(value)
    const next = new URLSearchParams(params)
    if (value) next.set('expiry', value)
    else next.delete('expiry')
    setParams(next, { replace: true })
  }

  const handleCreateCa = async (e: FormEvent) => {
    e.preventDefault(); setCaErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/cas`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: caName, common_name: caCn, is_root: caRoot, expires_at: caExpiry || null }) })
    const data = await r.json()
    if (!r.ok) { setCaErr(data.detail ?? 'Failed'); toast.error(data.detail ?? 'Failed'); return }
    setCas((p) => [...p, data]); setCaName(''); setCaCn(''); setCaExpiry(''); setShowCaForm(false)
    toast.ok('Certificate authority added')
  }

  const handleDeleteCa = async (id: number, name: string) => {
    if (!(await confirmDelete(`certificate authority "${name}"`))) return
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/cas/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setCas((p) => p.filter((c) => c.id !== id)); if (selectedCa?.id === id) setSelectedCa(null); toast.ok(`Deleted ${name}`) }
  }

  const handleCreateCert = async (e: FormEvent) => {
    e.preventDefault(); setCErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/certificates`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ common_name: cCn, cert_type: cType, issued_to: cIssuedTo || null, subject_alt_names: cSans || null, serial_number: cSerial || null, issued_at: cIssuedAt || null, expires_at: cExpiresAt || null, ca_id: cCaId ? Number(cCaId) : null, notes: cNotes || null }),
    })
    const data = await r.json()
    if (!r.ok) { setCErr(data.detail ?? 'Failed'); toast.error(data.detail ?? 'Failed'); return }
    setCerts((p) => [...p, data]); setCCn(''); setCIssuedTo(''); setCSans(''); setCSerial(''); setCIssuedAt(''); setCExpiresAt(''); setCCaId(''); setCNotes(''); setShowCertForm(false)
    toast.ok('Certificate added')
    load()
  }

  const handleRevoke = async (id: number) => {
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/certificates/${id}/revoke`, { method: 'POST', headers: authHeaders() })
    if (r.ok) { setCerts((p) => p.map((c) => c.id === id ? { ...c, status: 'revoked' } : c)); toast.ok('Certificate revoked'); load() }
  }

  const handleDeleteCert = async (id: number, name: string) => {
    if (!(await confirmDelete(`certificate "${name}"`))) return
    const r = await fetch(`${API_BASE_URL}/api/v1/pki/certificates/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setCerts((p) => p.filter((c) => c.id !== id)); toast.ok(`Deleted ${name}`); load() }
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

  const timeline = useMemo(() => {
    return [...certs]
      .filter((c) => c.expires_at && c.status !== 'revoked')
      .map((c) => ({ cert: c, days: daysUntil(c.expires_at) ?? 0 }))
      .sort((a, b) => a.days - b.days)
  }, [certs])

  const setExpiryFromChip = (value: string) => setExpiry(expiryFilter === value ? '' : value)

  return (
    <section className="space-y-6">
      <PageHeader
        crumbs={breadcrumbsFor('/pki')}
        title="Certificate Management"
        description="Track certificate authorities, issued certificates, and expiry across your homelab."
        actions={<button onClick={() => setShowCertForm((p) => !p)} className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">{showCertForm ? 'Cancel' : 'Add certificate'}</button>}
      />

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: 'Active', value: summary.active, badge: 'bg-ok/15 text-ok', expiry: '' },
            { label: 'Expiring 30d', value: summary.expiring_30d, badge: 'bg-danger/15 text-danger', expiry: '30' },
            { label: 'Expiring 90d', value: summary.expiring_90d, badge: 'bg-warn/15 text-warn', expiry: '90' },
            { label: 'Expired', value: summary.expired, badge: 'bg-danger/15 text-danger', expiry: 'expired' },
            { label: 'Revoked', value: summary.revoked, badge: 'bg-elevated text-muted', expiry: '' },
          ].map(({ label, value, badge, expiry }) => (
            <button key={label} type="button" onClick={() => expiry ? setExpiryFromChip(expiry) : undefined} className={`${card} flex items-center justify-between text-left ${expiry && expiryFilter === expiry ? 'ring-1 ring-accent' : ''}`}>
              <div><div className="text-2xl font-bold text-ink">{value}</div><div className="mt-0.5 text-xs text-muted">{label}</div></div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badge}`}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {timeline.length > 0 && (
        <div className={card}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Expiry timeline</h3>
            <p className="text-xs text-muted">Soonest first. Click a certificate to filter the table.</p>
          </div>
          <ol className="space-y-2">
            {timeline.slice(0, 12).map(({ cert, days }) => {
              const tone = days < 0 ? 'border-danger/30 bg-danger/10 text-danger' : days <= 30 ? 'border-warn/30 bg-warn/10 text-warn' : days <= 90 ? 'border-line bg-canvas text-ink' : 'border-ok/30 bg-ok/10 text-ok'
              return (
                <li key={cert.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left ${tone}`}
                    onClick={() => {
                      setFilter(cert.common_name)
                      setExpiry(days < 0 ? 'expired' : days <= 30 ? '30' : days <= 90 ? '90' : '')
                    }}
                  >
                    <span>
                      <span className="block font-mono text-sm font-semibold">{cert.common_name}</span>
                      <span className="block text-[11px] opacity-80">{cert.serial_number ? `Serial ${cert.serial_number}` : cert.cert_type}</span>
                    </span>
                    <ExpiryChip iso={cert.expires_at} />
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* CA list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Certificate Authorities</h3>
            <button onClick={() => setShowCaForm((p) => !p)} className="rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition hover:opacity-90">
              {showCaForm ? '✕' : '+ CA'}
            </button>
          </div>

          {showCaForm && (
            <form onSubmit={handleCreateCa} className={`${card} space-y-3`}>
              <div><label className={lbl}>Name</label><input value={caName} onChange={(e) => setCaName(e.target.value)} required className={input} /></div>
              <div><label className={lbl}>Common name (CN)</label><input value={caCn} onChange={(e) => setCaCn(e.target.value)} required placeholder="My Homelab CA" className={input} /></div>
              <div><label className={lbl}>Expires (optional)</label><input type="datetime-local" value={caExpiry} onChange={(e) => setCaExpiry(e.target.value)} className={input} /></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={caRoot} onChange={(e) => setCaRoot(e.target.checked)} className="h-4 w-4" /><label className="text-sm text-ink">Root CA</label></div>
              {caErr && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{caErr}</p>}
              <button type="submit" className="w-full rounded-2xl bg-accent py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90">Add CA</button>
            </form>
          )}

          <button onClick={() => setSelectedCa(null)} className={`group w-full rounded-2xl border px-4 py-3 text-left transition ${!selectedCa ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface hover:border-accent/40'}`}>
            <div className="text-sm font-semibold text-ink">All CAs</div>
            <div className="text-[11px] text-muted">{certs.length} certificates total</div>
          </button>

          {cas.map((ca) => (
            <div key={ca.id} role="button" tabIndex={0} onClick={() => setSelectedCa(ca)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedCa(ca) }} className={`group w-full cursor-pointer rounded-2xl border px-4 py-3 text-left transition ${selectedCa?.id === ca.id ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface hover:border-accent/40'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{ca.name}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteCa(ca.id, ca.name) }} className="hidden text-[10px] text-danger group-hover:block">✕</button>
              </div>
              <div className="mt-0.5 text-[11px] text-muted">{ca.common_name}</div>
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
            <h3 className="text-base font-semibold text-ink">
              {selectedCa ? `Certificates issued by ${selectedCa.name}` : 'All certificates'}
            </h3>
            <button onClick={() => setShowCertForm((p) => !p)} className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:opacity-90">
              {showCertForm ? '✕ Cancel' : '+ Certificate'}
            </button>
          </div>

          {showCertForm && (
            <form onSubmit={handleCreateCert} className={`${card} grid gap-3 md:grid-cols-2 xl:grid-cols-3`}>
              <div><label className={lbl}>Common name *</label><input value={cCn} onChange={(e) => setCCn(e.target.value)} required placeholder="server.homelab.local" className={input} /></div>
              <div><label className={lbl}>Type</label>
                <select value={cType} onChange={(e) => setCType(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent">
                  <option value="server">Server</option><option value="client">Client</option><option value="wildcard">Wildcard</option><option value="email">Email</option>
                </select>
              </div>
              <div><label className={lbl}>CA</label>
                <select value={cCaId} onChange={(e) => setCCaId(e.target.value)} className="w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent">
                  <option value="">— none —</option>{cas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className={lbl}>Issued to (hostname/service)</label><input value={cIssuedTo} onChange={(e) => setCIssuedTo(e.target.value)} className={input} /></div>
              <div><label className={lbl}>SANs (comma-separated)</label><input value={cSans} onChange={(e) => setCSans(e.target.value)} placeholder="server.local,192.168.1.10" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Serial number</label><input value={cSerial} onChange={(e) => setCSerial(e.target.value)} className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Issued at</label><input type="datetime-local" value={cIssuedAt} onChange={(e) => setCIssuedAt(e.target.value)} className={input} /></div>
              <div><label className={lbl}>Expires at</label><input type="datetime-local" value={cExpiresAt} onChange={(e) => setCExpiresAt(e.target.value)} className={input} /></div>
              <div><label className={lbl}>Notes</label><input value={cNotes} onChange={(e) => setCNotes(e.target.value)} className={input} /></div>
              {cErr && <p className="md:col-span-2 xl:col-span-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{cErr}</p>}
              <div className="md:col-span-2 xl:col-span-3 flex justify-end">
                <button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 font-semibold text-accent-fg shadow-sm transition hover:opacity-90">Add certificate</button>
              </div>
            </form>
          )}

          <FilterBar>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by CN, issued to, serial…" className={filterInputClass()} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterSelectClass()}>
              <option value="">All statuses</option><option value="active">Active</option><option value="expired">Expired</option><option value="revoked">Revoked</option><option value="pending">Pending</option>
            </select>
            <select value={expiryFilter} onChange={(e) => setExpiry(e.target.value)} className={filterSelectClass()}>
              <option value="">Any expiry</option><option value="30">Expiring ≤ 30d</option><option value="90">Expiring ≤ 90d</option><option value="expired">Already expired</option>
            </select>
          </FilterBar>

          <TableFrame>
            <Table>
              <THead>
                <tr><th className="px-4 py-3 font-medium">Common name</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Issued to</th><th className="px-4 py-3 font-medium">Serial</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Expires</th><th className="px-4 py-3 font-medium">Days left</th><th className="px-4 py-3" /></tr>
              </THead>
              <tbody className="divide-y divide-line bg-surface/70">
                {loading ? (
                  <SkeletonRows cols={8} />
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10">
                    <EmptyState title={certs.length === 0 ? 'No certificates tracked yet' : 'No certificates match'} body={certs.length === 0 ? 'Add your first certificate to start the expiry timeline.' : 'Clear filters or pick a different CA.'} />
                  </td></tr>
                ) : filtered.map((cert) => (
                    <tr key={cert.id} className="hover:bg-elevated/70">
                      <Td className="font-mono font-semibold text-ink">{cert.common_name}</Td>
                      <Td><TypePill t={cert.cert_type} /></Td>
                      <Td className="text-ink">{cert.issued_to ?? '—'}</Td>
                      <Td>{cert.serial_number ? <CopyText value={cert.serial_number} label="serial" /> : <span className="text-faint">—</span>}</Td>
                      <Td><StatusPill s={cert.status} /></Td>
                      <Td className="font-mono text-[11px] text-muted">{cert.expires_at ? <RelativeTime value={cert.expires_at} /> : '—'}</Td>
                      <Td><ExpiryChip iso={cert.expires_at} /></Td>
                      <Td className="text-right space-x-2">
                        {cert.status === 'active' && (
                          <button onClick={() => handleRevoke(cert.id)} className="rounded-xl border border-warn/30 bg-warn/10 px-2 py-1 text-[10px] text-warn hover:bg-warn/20">Revoke</button>
                        )}
                        <button onClick={() => handleDeleteCert(cert.id, cert.common_name)} className="rounded-xl border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] text-danger hover:bg-danger/20">✕</button>
                      </Td>
                    </tr>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        </div>
      </div>
    </section>
  )
}
