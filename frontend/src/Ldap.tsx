import { FormEvent, useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from './apiBase'

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('nexusops_token') ?? ''}`, 'Content-Type': 'application/json' }
}

// ── types ──────────────────────────────────────────────────────────────────

export type LdapServer = {
  id: number; name: string; host: string; port: number; use_ssl: boolean; use_tls: boolean
  base_dn: string; bind_dn: string | null; user_search_base: string | null
  user_filter: string; user_attr_map: string; group_search_base: string | null
  status: string; last_sync_at: string | null; last_test_at: string | null
  last_test_status: string | null; notes: string | null
}
export type SyncLog = {
  id: number; server_id: number; status: string; users_found: number
  users_created: number; users_updated: number; error_message: string | null
  started_at: string; finished_at: string | null
}
export type BrowseEntry = { dn: string; attributes: Record<string, string> }

// ── helpers ─────────────────────────────────────────────────────────────────

const TEST_BADGE: Record<string, string> = {
  ok:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}
const SYNC_BADGE: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-300',
  error:   'bg-rose-500/15 text-rose-300',
  running: 'bg-amber-500/15 text-amber-300',
}

const input = 'w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-sky-400'
const lbl = 'mb-2 block text-sm font-medium text-slate-200'
const card = 'rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]'

// ── LDAP main panel ────────────────────────────────────────────────────────

export function LdapPanel() {
  const [servers, setServers] = useState<LdapServer[]>([])
  const [selected, setSelected] = useState<LdapServer | null>(null)
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [browseResults, setBrowseResults] = useState<BrowseEntry[] | null>(null)
  const [browseFilter, setBrowseFilter] = useState('(objectClass=person)')
  const [browsing, setBrowsing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ status: string; message: string } | null>(null)
  const [showForm, setShowForm] = useState(false)

  // form state
  const [fName, setFName] = useState('')
  const [fHost, setFHost] = useState('')
  const [fPort, setFPort] = useState('389')
  const [fSsl, setFSsl] = useState(false)
  const [fTls, setFTls] = useState(false)
  const [fBaseDn, setFBaseDn] = useState('')
  const [fBindDn, setFBindDn] = useState('')
  const [fBindPw, setFBindPw] = useState('')
  const [fUserBase, setFUserBase] = useState('')
  const [fFilter, setFFilter] = useState('(objectClass=person)')
  const [fAttrMap, setFAttrMap] = useState('{"username":"sAMAccountName","email":"mail","full_name":"cn"}')
  const [fNotes, setFNotes] = useState('')
  const [fErr, setFErr] = useState('')

  const loadServers = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/ldap/servers`, { headers: authHeaders() })
      .then((r) => r.json()).then(setServers).catch(() => undefined)
  }, [])

  const loadSyncLogs = useCallback((serverId: number) => {
    fetch(`${API_BASE_URL}/api/v1/ldap/servers/${serverId}/sync-logs`, { headers: authHeaders() })
      .then((r) => r.json()).then(setSyncLogs).catch(() => undefined)
  }, [])

  useEffect(() => { loadServers() }, [loadServers])
  useEffect(() => { if (selected) loadSyncLogs(selected.id) }, [selected, loadSyncLogs])

  const handleCreateServer = async (e: FormEvent) => {
    e.preventDefault(); setFErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: fName, host: fHost, port: Number(fPort), use_ssl: fSsl, use_tls: fTls, base_dn: fBaseDn, bind_dn: fBindDn || null, bind_password: fBindPw || null, user_search_base: fUserBase || null, user_filter: fFilter, user_attr_map: fAttrMap, notes: fNotes || null }),
    })
    const data = await r.json()
    if (!r.ok) { setFErr(data.detail ?? 'Failed'); return }
    setServers((p) => [...p, data])
    setFName(''); setFHost(''); setFPort('389'); setFSsl(false); setFTls(false); setFBaseDn(''); setFBindDn(''); setFBindPw(''); setFUserBase(''); setFFilter('(objectClass=person)'); setFAttrMap('{"username":"sAMAccountName","email":"mail","full_name":"cn"}'); setFNotes(''); setShowForm(false)
  }

  const handleDelete = async (id: number) => {
    const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setServers((p) => p.filter((s) => s.id !== id)); if (selected?.id === id) setSelected(null) }
  }

  const handleTest = async () => {
    if (!selected) return
    setTesting(true); setTestResult(null)
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers/${selected.id}/test`, { method: 'POST', headers: authHeaders() })
      const data = await r.json()
      setTestResult(data)
      loadServers()
    } finally { setTesting(false) }
  }

  const handleBrowse = async () => {
    if (!selected) return
    setBrowsing(true); setBrowseResults(null)
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers/${selected.id}/browse?search_filter=${encodeURIComponent(browseFilter)}&limit=50`, { method: 'POST', headers: authHeaders() })
      const data = await r.json()
      setBrowseResults(data.entries ?? [])
    } catch { setBrowseResults([]) }
    finally { setBrowsing(false) }
  }

  const handleSync = async () => {
    if (!selected) return
    setSyncing(true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers/${selected.id}/sync`, { method: 'POST', headers: authHeaders() })
      if (r.ok) { loadSyncLogs(selected.id); loadServers() }
    } finally { setSyncing(false) }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300">Infrastructure / LDAP</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">LDAP Integration</h2>
        <p className="mt-2 text-slate-300">Connect to LDAP/Active Directory servers, browse the directory, and sync users.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* server list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">LDAP Servers</h3>
            <button onClick={() => setShowForm((p) => !p)} className="rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110">
              {showForm ? '✕' : '+ Server'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreateServer} className={`${card} space-y-3`}>
              <div><label className={lbl}>Name</label><input value={fName} onChange={(e) => setFName(e.target.value)} required placeholder="Home AD" className={input} /></div>
              <div><label className={lbl}>Host</label><input value={fHost} onChange={(e) => setFHost(e.target.value)} required placeholder="192.168.1.10" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Port</label><input type="number" value={fPort} onChange={(e) => setFPort(e.target.value)} className={input} /></div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={fSsl} onChange={(e) => setFSsl(e.target.checked)} className="h-4 w-4" /> SSL</label>
                <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={fTls} onChange={(e) => setFTls(e.target.checked)} className="h-4 w-4" /> STARTTLS</label>
              </div>
              <div><label className={lbl}>Base DN</label><input value={fBaseDn} onChange={(e) => setFBaseDn(e.target.value)} required placeholder="dc=homelab,dc=local" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Bind DN (service account)</label><input value={fBindDn} onChange={(e) => setFBindDn(e.target.value)} placeholder="cn=svc,dc=homelab,dc=local" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Bind password</label><input type="password" value={fBindPw} onChange={(e) => setFBindPw(e.target.value)} className={input} /></div>
              <div><label className={lbl}>User search base</label><input value={fUserBase} onChange={(e) => setFUserBase(e.target.value)} placeholder="ou=users,dc=homelab,dc=local" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>User filter</label><input value={fFilter} onChange={(e) => setFFilter(e.target.value)} className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Attribute map (JSON)</label><textarea value={fAttrMap} onChange={(e) => setFAttrMap(e.target.value)} rows={3} className={`${input} font-mono text-xs`} /></div>
              <div><label className={lbl}>Notes</label><input value={fNotes} onChange={(e) => setFNotes(e.target.value)} className={input} /></div>
              {fErr && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{fErr}</p>}
              <button type="submit" className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110">Add server</button>
            </form>
          )}

          {servers.length === 0 ? (
            <p className={`${card} text-center text-sm text-slate-400`}>No LDAP servers configured yet.</p>
          ) : servers.map((svr) => (
            <button key={svr.id} onClick={() => setSelected(svr)} className={`group w-full rounded-2xl border p-4 text-left transition ${selected?.id === svr.id ? 'border-sky-500/40 bg-sky-500/10' : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white">{svr.name}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(svr.id) }} className="hidden text-xs text-rose-400 hover:text-rose-300 group-hover:block">✕</button>
              </div>
              <div className="font-mono text-[11px] text-slate-400">{svr.host}:{svr.port}{svr.use_ssl ? ' (SSL)' : ''}</div>
              <div className="mt-1 flex items-center gap-2">
                {svr.last_test_status && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TEST_BADGE[svr.last_test_status] ?? 'bg-slate-700 text-slate-400'}`}>
                    {svr.last_test_status === 'ok' ? '✓ Connected' : '✗ Error'}
                  </span>
                )}
                {svr.last_sync_at && <span className="text-[10px] text-slate-500">synced {new Date(svr.last_sync_at).toLocaleDateString()}</span>}
              </div>
            </button>
          ))}
        </div>

        {/* detail panel */}
        {!selected ? (
          <div className={`${card} flex items-center justify-center py-16 text-slate-400`}>Select a server to test, browse, and sync.</div>
        ) : (
          <div className="space-y-5">
            {/* header */}
            <div className={`${card} flex flex-col gap-4 md:flex-row md:items-start md:justify-between`}>
              <div>
                <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                <div className="mt-1 font-mono text-sm text-slate-400">{selected.host}:{selected.port} · {selected.base_dn}</div>
                {selected.notes && <div className="mt-2 text-sm text-slate-300">{selected.notes}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleTest} disabled={testing} className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-60">
                  {testing ? '⟳ Testing…' : '⟳ Test connection'}
                </button>
                <button onClick={handleSync} disabled={syncing} className="rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-indigo-500/20 transition hover:brightness-110 disabled:opacity-60">
                  {syncing ? '⟳ Syncing…' : '⟳ Sync users'}
                </button>
              </div>
            </div>

            {testResult && (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${testResult.status === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                {testResult.status === 'ok' ? '✓ ' : '✗ '}{testResult.message}
              </div>
            )}

            {/* browse */}
            <div className={card}>
              <h4 className="mb-4 text-sm font-semibold text-white">Browse directory</h4>
              <div className="flex gap-3">
                <input value={browseFilter} onChange={(e) => setBrowseFilter(e.target.value)} className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm text-slate-100 outline-none focus:border-sky-400" />
                <button onClick={handleBrowse} disabled={browsing} className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-60">
                  {browsing ? 'Searching…' : 'Search'}
                </button>
              </div>
              {browseResults !== null && (
                <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                  {browseResults.length === 0 ? (
                    <p className="text-sm text-slate-400">No entries found.</p>
                  ) : browseResults.map((entry, i) => (
                    <div key={i} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="font-mono text-[11px] font-semibold text-sky-300">{entry.dn}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {Object.entries(entry.attributes).slice(0, 6).map(([k, v]) => (
                          <span key={k} className="rounded-lg bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300"><span className="text-slate-500">{k}:</span> {v}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* sync logs */}
            <div className={card}>
              <h4 className="mb-4 text-sm font-semibold text-white">Sync history</h4>
              {syncLogs.length === 0 ? (
                <p className="text-sm text-slate-400">No sync runs yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800">
                  <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
                    <thead className="bg-slate-950/80 text-slate-300"><tr><th className="px-3 py-3 font-medium">Started</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Found</th><th className="px-3 py-3 font-medium">Created</th><th className="px-3 py-3 font-medium">Updated</th><th className="px-3 py-3 font-medium">Duration</th></tr></thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                      {syncLogs.map((log) => {
                        const dur = log.finished_at ? Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000) : null
                        return (
                          <tr key={log.id} className="hover:bg-slate-800/50">
                            <td className="px-3 py-3 text-[11px] text-slate-300">{new Date(log.started_at).toLocaleString()}</td>
                            <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${SYNC_BADGE[log.status] ?? 'bg-slate-700 text-slate-300'}`}>{log.status}</span></td>
                            <td className="px-3 py-3 text-center text-white">{log.users_found}</td>
                            <td className="px-3 py-3 text-center text-emerald-400">{log.users_created}</td>
                            <td className="px-3 py-3 text-center text-indigo-400">{log.users_updated}</td>
                            <td className="px-3 py-3 text-slate-400">{dur !== null ? `${dur}s` : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {syncLogs.some((l) => l.error_message) && (
                <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  {syncLogs.find((l) => l.error_message)?.error_message}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
