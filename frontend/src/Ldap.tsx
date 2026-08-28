import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { API_BASE_URL, authHeaders } from './api/client'
import { confirmDelete } from './confirm'

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
export type DirectoryUser = {
  dn: string; username: string; common_name: string; uid: string
  first_name: string | null; last_name: string | null; display_name: string | null
  email: string | null; phone: string | null; title: string | null
  department: string | null; office: string | null; manager_dn: string | null
  enabled: boolean; employee_type: string | null; member_of: string[]
}
export type DirectoryGroup = {
  dn: string; name: string; description: string | null; members: string[]; member_count: number
}
export type DirectoryOu = { dn: string; name: string; description: string | null }
export type TreeNode = { dn: string; name: string; kind: string }

type Tab = 'users' | 'groups' | 'ous' | 'tree' | 'sync'

const TEST_BADGE: Record<string, string> = {
  ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}
const SYNC_BADGE: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-300',
  error: 'bg-rose-500/15 text-rose-300',
  running: 'bg-amber-500/15 text-amber-300',
}

const input = 'w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-sky-400'
const lbl = 'mb-2 block text-sm font-medium text-slate-200'
const card = 'rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]'

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) return data.detail.map((item: { msg?: string }) => item.msg ?? JSON.stringify(item)).join('; ')
    return fallback
  } catch {
    return fallback
  }
}

export function LdapPanel() {
  const [servers, setServers] = useState<LdapServer[]>([])
  const [selected, setSelected] = useState<LdapServer | null>(null)
  const [tab, setTab] = useState<Tab>('users')
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testResult, setTestResult] = useState<{ status: string; message: string } | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [fName, setFName] = useState('')
  const [fHost, setFHost] = useState('')
  const [fPort, setFPort] = useState('389')
  const [fSsl, setFSsl] = useState(false)
  const [fTls, setFTls] = useState(false)
  const [fBaseDn, setFBaseDn] = useState('')
  const [fBindDn, setFBindDn] = useState('')
  const [fBindPw, setFBindPw] = useState('')
  const [fUserBase, setFUserBase] = useState('')
  const [fGroupBase, setFGroupBase] = useState('')
  const [fFilter, setFFilter] = useState('(objectClass=inetOrgPerson)')
  const [fAttrMap, setFAttrMap] = useState('{"username":"uid","email":"mail","full_name":"cn"}')
  const [fNotes, setFNotes] = useState('')
  const [fErr, setFErr] = useState('')

  const loadServers = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/ldap/servers`, { headers: authHeaders() })
      .then((r) => r.json()).then((data) => {
        const list = Array.isArray(data) ? data : []
        setServers(list)
        setSelected((current) => current ? list.find((item: LdapServer) => item.id === current.id) ?? current : current)
      }).catch(() => undefined)
  }, [])

  const loadSyncLogs = useCallback((serverId: number) => {
    fetch(`${API_BASE_URL}/api/v1/ldap/servers/${serverId}/sync-logs`, { headers: authHeaders() })
      .then((r) => r.json()).then((data) => setSyncLogs(Array.isArray(data) ? data : [])).catch(() => undefined)
  }, [])

  useEffect(() => { loadServers() }, [loadServers])
  useEffect(() => { if (selected) loadSyncLogs(selected.id) }, [selected, loadSyncLogs])

  const handleCreateServer = async (e: FormEvent) => {
    e.preventDefault(); setFErr('')
    const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        name: fName, host: fHost, port: Number(fPort), use_ssl: fSsl, use_tls: fTls, base_dn: fBaseDn,
        bind_dn: fBindDn || null, bind_password: fBindPw || null, user_search_base: fUserBase || null,
        group_search_base: fGroupBase || null, user_filter: fFilter, user_attr_map: fAttrMap, notes: fNotes || null,
      }),
    })
    const data = await r.json()
    if (!r.ok) { setFErr(data.detail ?? 'Failed'); return }
    setServers((p) => [...p, data])
    setFName(''); setFHost(''); setFPort('389'); setFSsl(false); setFTls(false); setFBaseDn(''); setFBindDn(''); setFBindPw(''); setFUserBase(''); setFGroupBase(''); setFFilter('(objectClass=inetOrgPerson)'); setFAttrMap('{"username":"uid","email":"mail","full_name":"cn"}'); setFNotes(''); setShowForm(false)
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirmDelete(`LDAP server "${name}"`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { setServers((p) => p.filter((s) => s.id !== id)); if (selected?.id === id) setSelected(null) }
  }

  const handleTest = async () => {
    if (!selected) return
    setTesting(true); setTestResult(null)
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers/${selected.id}/test`, { method: 'POST', headers: authHeaders() })
      setTestResult(await r.json())
      loadServers()
    } finally { setTesting(false) }
  }

  const handleSync = async () => {
    if (!selected) return
    setSyncing(true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers/${selected.id}/sync`, { method: 'POST', headers: authHeaders() })
      if (r.ok) { loadSyncLogs(selected.id); loadServers() }
    } finally { setSyncing(false) }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'groups', label: 'Groups' },
    { id: 'ous', label: 'OUs' },
    { id: 'tree', label: 'Tree' },
    { id: 'sync', label: 'Sync' },
  ]

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300">Infrastructure / Directory</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Directory Manager</h2>
        <p className="mt-2 text-slate-300">Create and manage LDAP users, groups, and organizational units the same way you would in Active Directory Users and Computers.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Directories</h3>
            <button onClick={() => setShowForm((p) => !p)} className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-110">
              {showForm ? '✕' : '+ Server'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleCreateServer} className={`${card} space-y-3`}>
              <div><label className={lbl}>Name</label><input value={fName} onChange={(e) => setFName(e.target.value)} required placeholder="Home AD" className={input} /></div>
              <div><label className={lbl}>Host</label><input value={fHost} onChange={(e) => setFHost(e.target.value)} required placeholder="openldap" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Port</label><input type="number" value={fPort} onChange={(e) => setFPort(e.target.value)} className={input} /></div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={fSsl} onChange={(e) => setFSsl(e.target.checked)} className="h-4 w-4" /> SSL</label>
                <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={fTls} onChange={(e) => setFTls(e.target.checked)} className="h-4 w-4" /> STARTTLS</label>
              </div>
              <div><label className={lbl}>Base DN</label><input value={fBaseDn} onChange={(e) => setFBaseDn(e.target.value)} required placeholder="dc=homelab,dc=local" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Bind DN</label><input value={fBindDn} onChange={(e) => setFBindDn(e.target.value)} placeholder="cn=admin,dc=homelab,dc=local" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Bind password</label><input type="password" value={fBindPw} onChange={(e) => setFBindPw(e.target.value)} className={input} /></div>
              <div><label className={lbl}>User search base</label><input value={fUserBase} onChange={(e) => setFUserBase(e.target.value)} placeholder="ou=users,dc=homelab,dc=local" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Group search base</label><input value={fGroupBase} onChange={(e) => setFGroupBase(e.target.value)} placeholder="ou=groups,dc=homelab,dc=local" className={`${input} font-mono`} /></div>
              <div><label className={lbl}>User filter</label><input value={fFilter} onChange={(e) => setFFilter(e.target.value)} className={`${input} font-mono`} /></div>
              <div><label className={lbl}>Attribute map (JSON)</label><textarea value={fAttrMap} onChange={(e) => setFAttrMap(e.target.value)} rows={3} className={`${input} font-mono text-xs`} /></div>
              <div><label className={lbl}>Notes</label><input value={fNotes} onChange={(e) => setFNotes(e.target.value)} className={input} /></div>
              {fErr && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{fErr}</p>}
              <button type="submit" className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110">Add server</button>
            </form>
          )}

          {servers.length === 0 ? (
            <p className={`${card} text-center text-sm text-slate-400`}>No LDAP servers configured yet.</p>
          ) : servers.map((svr) => (
            <div
              key={svr.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(svr)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(svr) }}
              className={`group w-full cursor-pointer rounded-2xl border p-4 text-left transition ${selected?.id === svr.id ? 'border-sky-500/40 bg-sky-500/10' : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white">{svr.name}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(svr.id, svr.name) }} className="hidden text-xs text-rose-400 hover:text-rose-300 group-hover:block">✕</button>
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
            </div>
          ))}
        </div>

        {!selected ? (
          <div className={`${card} flex items-center justify-center py-16 text-slate-400`}>Select a directory to manage users, groups, and OUs.</div>
        ) : (
          <div className="space-y-5">
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
                <button onClick={handleSync} disabled={syncing} className="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:brightness-110 disabled:opacity-60">
                  {syncing ? '⟳ Syncing…' : '⟳ Sync to NexusOps'}
                </button>
              </div>
            </div>

            {testResult && (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${testResult.status === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                {testResult.status === 'ok' ? '✓ ' : '✗ '}{testResult.message}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${tab === item.id ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                  {item.label}
                </button>
              ))}
            </div>

            {tab === 'users' && <UsersTab server={selected} />}
            {tab === 'groups' && <GroupsTab server={selected} />}
            {tab === 'ous' && <OusTab server={selected} />}
            {tab === 'tree' && <TreeTab server={selected} />}
            {tab === 'sync' && <SyncTab logs={syncLogs} />}
          </div>
        )}
      </div>
    </section>
  )
}

function UsersTab({ server }: { server: LdapServer }) {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [groups, setGroups] = useState<DirectoryGroup[]>([])
  const [query, setQuery] = useState('')
  const [enabledFilter, setEnabledFilter] = useState('')
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DirectoryUser | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [office, setOffice] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [memberOf, setMemberOf] = useState<string[]>([])
  const [resetPw, setResetPw] = useState('')

  const base = `${API_BASE_URL}/api/v1/ldap/servers/${server.id}/directory`

  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (enabledFilter === 'true') params.set('enabled', 'true')
    if (enabledFilter === 'false') params.set('enabled', 'false')
    Promise.all([
      fetch(`${base}/users?${params.toString()}`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${base}/groups`, { headers: authHeaders() }).then((r) => r.json()),
    ]).then(([u, g]) => {
      setUsers(Array.isArray(u) ? u : [])
      setGroups(Array.isArray(g) ? g : [])
    }).catch(() => setError('Unable to load directory users'))
  }, [base, query, enabledFilter])

  useEffect(() => { load() }, [load])

  const resetForm = () => {
    setEditing(null); setUsername(''); setPassword(''); setFirstName(''); setLastName(''); setDisplayName(''); setEmail(''); setPhone(''); setTitle(''); setDepartment(''); setOffice(''); setEnabled(true); setMemberOf([]); setResetPw(''); setShowForm(false); setError('')
  }

  const startEdit = (user: DirectoryUser) => {
    setEditing(user); setShowForm(true); setUsername(user.username); setPassword(''); setFirstName(user.first_name ?? ''); setLastName(user.last_name ?? ''); setDisplayName(user.display_name ?? ''); setEmail(user.email ?? ''); setPhone(user.phone ?? ''); setTitle(user.title ?? ''); setDepartment(user.department ?? ''); setOffice(user.office ?? ''); setEnabled(user.enabled); setMemberOf(user.member_of); setResetPw('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    if (editing) {
      const r = await fetch(`${base}/users/${encodeURIComponent(editing.username)}`, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ first_name: firstName || null, last_name: lastName || null, display_name: displayName || null, email: email || null, phone: phone || null, title: title || null, department: department || null, office: office || null, enabled, member_of: memberOf }),
      })
      if (!r.ok) { setError(await readError(r, 'Unable to update user')); return }
      if (resetPw) {
        const pw = await fetch(`${base}/users/${encodeURIComponent(editing.username)}/password`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify({ password: resetPw }),
        })
        if (!pw.ok) { setError(await readError(pw, 'Unable to reset password')); return }
      }
    } else {
      const r = await fetch(`${base}/users`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ username, password: password || null, first_name: firstName || null, last_name: lastName || null, display_name: displayName || username, email: email || null, phone: phone || null, title: title || null, department: department || null, office: office || null, enabled, member_of: memberOf }),
      })
      if (!r.ok) { setError(await readError(r, 'Unable to create user')); return }
    }
    resetForm(); load()
  }

  const handleDelete = async (user: DirectoryUser) => {
    if (!confirmDelete(`directory user "${user.username}"`)) return
    const r = await fetch(`${base}/users/${encodeURIComponent(user.username)}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) load()
    else setError(await readError(r, 'Unable to delete user'))
  }

  const toggleGroup = (name: string) => setMemberOf((p) => p.includes(name) ? p.filter((item) => item !== name) : [...p, name])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search username, name, or email…" className="min-w-[200px] flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400" />
        <select value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value)} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100">
          <option value="">All accounts</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
        <button onClick={() => { resetForm(); setShowForm(true) }} className="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">{showForm && !editing ? '✕ Cancel' : '+ User'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className={`${card} grid gap-3 md:grid-cols-2 xl:grid-cols-3`}>
          <div className="md:col-span-2 xl:col-span-3 text-sm font-semibold text-white">{editing ? `Edit ${editing.username}` : 'New directory user'}</div>
          {!editing && <div><label className={lbl}>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} required className={`${input} font-mono`} /></div>}
          {!editing && <div><label className={lbl}>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} className={input} /></div>}
          {editing && <div className="md:col-span-2"><label className={lbl}>Reset password</label><input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} minLength={8} placeholder="Leave blank to keep current password" className={input} /></div>}
          <div><label className={lbl}>First name</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={input} /></div>
          <div><label className={lbl}>Last name</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} className={input} /></div>
          <div><label className={lbl}>Display name</label><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={input} /></div>
          <div><label className={lbl}>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></div>
          <div><label className={lbl}>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className={input} /></div>
          <div><label className={lbl}>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className={input} /></div>
          <div><label className={lbl}>Department</label><input value={department} onChange={(e) => setDepartment(e.target.value)} className={input} /></div>
          <div><label className={lbl}>Office</label><input value={office} onChange={(e) => setOffice(e.target.value)} className={input} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" /> Account enabled</label>
          {groups.length > 0 && (
            <div className="md:col-span-2 xl:col-span-3">
              <label className={lbl}>Member of</label>
              <div className="flex flex-wrap gap-2">
                {groups.map((group) => (
                  <button key={group.name} type="button" onClick={() => toggleGroup(group.name)} className={`rounded-full border px-3 py-1 text-xs font-medium ${memberOf.includes(group.name) ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-slate-700 bg-slate-950 text-slate-400'}`}>{group.name}</button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="md:col-span-2 xl:col-span-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
          <div className="md:col-span-2 xl:col-span-3 flex justify-end gap-2">
            <button type="button" onClick={resetForm} className="rounded-2xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300">Cancel</button>
            <button type="submit" className="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950">{editing ? 'Save user' : 'Create user'}</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-[26px] border border-slate-800 bg-slate-900/80">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/80 text-slate-300"><tr><th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Title / Dept</th><th className="px-4 py-3 font-medium">Groups</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No directory users found.</td></tr>
            ) : users.map((user) => (
              <tr key={user.dn} className="hover:bg-slate-800/50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-white">{user.display_name || user.username}</div>
                  <div className="font-mono text-[11px] text-slate-400">{user.username}</div>
                </td>
                <td className="px-4 py-3 text-slate-300">{user.email ?? '—'}</td>
                <td className="px-4 py-3 text-slate-300">{[user.title, user.department].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{user.member_of.length === 0 ? <span className="text-slate-500">—</span> : user.member_of.map((name) => <span key={name} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-300">{name}</span>)}</div></td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${user.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{user.enabled ? 'Enabled' : 'Disabled'}</span></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => startEdit(user)} className="rounded-xl border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800">Edit</button>
                    <button onClick={() => handleDelete(user)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupsTab({ server }: { server: LdapServer }) {
  const [groups, setGroups] = useState<DirectoryGroup[]>([])
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [selected, setSelected] = useState<DirectoryGroup | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [members, setMembers] = useState<string[]>([])
  const [addMember, setAddMember] = useState('')

  const base = `${API_BASE_URL}/api/v1/ldap/servers/${server.id}/directory`

  const load = useCallback(() => {
    const params = query ? `?q=${encodeURIComponent(query)}` : ''
    Promise.all([
      fetch(`${base}/groups${params}`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${base}/users`, { headers: authHeaders() }).then((r) => r.json()),
    ]).then(([g, u]) => {
      const groupsList: DirectoryGroup[] = Array.isArray(g) ? g : []
      setGroups(groupsList)
      setUsers(Array.isArray(u) ? u : [])
      setSelected((current) => current ? groupsList.find((item) => item.name === current.name) ?? current : current)
    }).catch(() => setError('Unable to load groups'))
  }, [base, query])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const r = await fetch(`${base}/groups`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name, description: description || null, members }),
    })
    if (!r.ok) { setError(await readError(r, 'Unable to create group')); return }
    setName(''); setDescription(''); setMembers([]); setShowForm(false); load()
  }

  const handleDelete = async (group: DirectoryGroup) => {
    if (!confirmDelete(`group "${group.name}"`)) return
    const r = await fetch(`${base}/groups/${encodeURIComponent(group.name)}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) { if (selected?.name === group.name) setSelected(null); load() }
    else setError(await readError(r, 'Unable to delete group'))
  }

  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected || !addMember) return
    const r = await fetch(`${base}/groups/${encodeURIComponent(selected.name)}/members`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ member: addMember }),
    })
    if (!r.ok) { setError(await readError(r, 'Unable to add member')); return }
    setAddMember(''); load()
  }

  const handleRemoveMember = async (member: string) => {
    if (!selected) return
    const r = await fetch(`${base}/groups/${encodeURIComponent(selected.name)}/members?member=${encodeURIComponent(member)}`, { method: 'DELETE', headers: authHeaders() })
    if (!r.ok) { setError(await readError(r, 'Unable to remove member')); return }
    load()
  }

  const memberLabel = (dn: string) => users.find((user) => user.dn === dn)?.username || dn.split(',')[0].replace(/^cn=/i, '')

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search groups…" className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
          <button onClick={() => setShowForm((p) => !p)} className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950">+</button>
        </div>
        {showForm && (
          <form onSubmit={handleCreate} className={`${card} space-y-3`}>
            <div><label className={lbl}>Group name</label><input value={name} onChange={(e) => setName(e.target.value)} required className={input} /></div>
            <div><label className={lbl}>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className={input} /></div>
            <div>
              <label className={lbl}>Initial members</label>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {users.map((user) => (
                  <label key={user.dn} className="flex items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={members.includes(user.dn)} onChange={() => setMembers((p) => p.includes(user.dn) ? p.filter((item) => item !== user.dn) : [...p, user.dn])} />
                    {user.username}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            <button type="submit" className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 py-2 text-sm font-semibold text-slate-950">Create group</button>
          </form>
        )}
        {groups.map((group) => (
          <div key={group.dn} role="button" tabIndex={0} onClick={() => setSelected(group)} className={`group cursor-pointer rounded-2xl border p-3 ${selected?.name === group.name ? 'border-sky-500/40 bg-sky-500/10' : 'border-slate-800 bg-slate-900/80'}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{group.name}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(group) }} className="hidden text-xs text-rose-400 group-hover:block">✕</button>
            </div>
            <div className="text-[11px] text-slate-400">{group.member_count} members</div>
          </div>
        ))}
      </div>
      {!selected ? (
        <div className={`${card} flex items-center justify-center text-slate-400`}>Select a group to manage membership.</div>
      ) : (
        <div className={`${card} space-y-4`}>
          <div>
            <h4 className="text-lg font-bold text-white">{selected.name}</h4>
            <p className="text-sm text-slate-400">{selected.description || selected.dn}</p>
          </div>
          <form onSubmit={handleAddMember} className="flex gap-2">
            <select value={addMember} onChange={(e) => setAddMember(e.target.value)} className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
              <option value="">Add a member…</option>
              {users.filter((user) => !selected.members.includes(user.dn)).map((user) => (
                <option key={user.dn} value={user.username}>{user.display_name || user.username}</option>
              ))}
            </select>
            <button type="submit" className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950">Add</button>
          </form>
          {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
          <div className="space-y-2">
            {selected.members.length === 0 ? <p className="text-sm text-slate-400">No members.</p> : selected.members.map((member) => (
              <div key={member} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <div>
                  <div className="text-sm text-white">{memberLabel(member)}</div>
                  <div className="font-mono text-[11px] text-slate-500">{member}</div>
                </div>
                <button onClick={() => handleRemoveMember(member)} className="text-xs text-rose-400">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OusTab({ server }: { server: LdapServer }) {
  const [ous, setOus] = useState<DirectoryOu[]>([])
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [parentDn, setParentDn] = useState(server.base_dn)
  const [description, setDescription] = useState('')
  const base = `${API_BASE_URL}/api/v1/ldap/servers/${server.id}/directory`

  const load = useCallback(() => {
    fetch(`${base}/ous`, { headers: authHeaders() }).then((r) => r.json()).then((data) => setOus(Array.isArray(data) ? data : [])).catch(() => setError('Unable to load OUs'))
  }, [base])
  useEffect(() => { load(); setParentDn(server.base_dn) }, [load, server.base_dn])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const r = await fetch(`${base}/ous`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, parent_dn: parentDn, description: description || null }) })
    if (!r.ok) { setError(await readError(r, 'Unable to create OU')); return }
    setName(''); setDescription(''); load()
  }

  const handleDelete = async (ou: DirectoryOu) => {
    if (!confirmDelete(`organizational unit "${ou.name}"`)) return
    const r = await fetch(`${base}/ous?dn=${encodeURIComponent(ou.dn)}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) load()
    else setError(await readError(r, 'Unable to delete OU'))
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className={`${card} grid gap-3 md:grid-cols-3`}>
        <div><label className={lbl}>OU name</label><input value={name} onChange={(e) => setName(e.target.value)} required className={input} /></div>
        <div><label className={lbl}>Parent DN</label><input value={parentDn} onChange={(e) => setParentDn(e.target.value)} required className={`${input} font-mono`} /></div>
        <div><label className={lbl}>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className={input} /></div>
        {error && <p className="md:col-span-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
        <div className="md:col-span-3 flex justify-end"><button type="submit" className="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950">Create OU</button></div>
      </form>
      <div className="overflow-x-auto rounded-[26px] border border-slate-800 bg-slate-900/80">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/80 text-slate-300"><tr><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">DN</th><th className="px-4 py-3" /></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {ous.map((ou) => (
              <tr key={ou.dn}>
                <td className="px-4 py-3 text-white">{ou.name}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{ou.dn}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => handleDelete(ou)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TreeTab({ server }: { server: LdapServer }) {
  const [path, setPath] = useState(server.base_dn)
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [error, setError] = useState('')

  const load = useCallback((dn: string) => {
    fetch(`${API_BASE_URL}/api/v1/ldap/servers/${server.id}/directory/tree?base_dn=${encodeURIComponent(dn)}`, { headers: authHeaders() })
      .then((r) => r.json()).then((data) => { setNodes(Array.isArray(data) ? data : []); setPath(dn); setError('') })
      .catch(() => setError('Unable to load directory tree'))
  }, [server.id])

  useEffect(() => { load(server.base_dn) }, [load, server.base_dn])

  const crumbs = useMemo(() => {
    const parts = path.split(',')
    return parts.map((_, index) => parts.slice(index).join(','))
  }, [path])

  return (
    <div className={`${card} space-y-4`}>
      <div className="flex flex-wrap gap-1 text-[11px] text-slate-400">
        {crumbs.slice().reverse().map((dn, index) => (
          <button key={dn} onClick={() => load(dn)} className="rounded-lg px-2 py-1 hover:bg-slate-800 hover:text-sky-300">
            {index === 0 ? dn : dn.split(',')[0]}
            {index < crumbs.length - 1 ? ' /' : ''}
          </button>
        ))}
      </div>
      {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
      <div className="space-y-2">
        {nodes.length === 0 ? <p className="text-sm text-slate-400">No child entries.</p> : nodes.map((node) => (
          <button key={node.dn} onClick={() => node.kind === 'ou' ? load(node.dn) : undefined} className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left">
            <div>
              <div className="text-sm text-white">{node.name}</div>
              <div className="font-mono text-[11px] text-slate-500">{node.dn}</div>
            </div>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-300">{node.kind}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SyncTab({ logs }: { logs: SyncLog[] }) {
  return (
    <div className={card}>
      <h4 className="mb-4 text-sm font-semibold text-white">Sync history</h4>
      {logs.length === 0 ? (
        <p className="text-sm text-slate-400">No sync runs yet. Use “Sync to NexusOps” to import directory users into local accounts.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/80 text-slate-300"><tr><th className="px-3 py-3 font-medium">Started</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Found</th><th className="px-3 py-3 font-medium">Created</th><th className="px-3 py-3 font-medium">Updated</th></tr></thead>
            <tbody className="divide-y divide-slate-800">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-3 text-[11px] text-slate-300">{new Date(log.started_at).toLocaleString()}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${SYNC_BADGE[log.status] ?? 'bg-slate-700 text-slate-300'}`}>{log.status}</span></td>
                  <td className="px-3 py-3 text-white">{log.users_found}</td>
                  <td className="px-3 py-3 text-emerald-400">{log.users_created}</td>
                  <td className="px-3 py-3 text-cyan-400">{log.users_updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {logs.some((l) => l.error_message) && (
        <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          {logs.find((l) => l.error_message)?.error_message}
        </div>
      )}
    </div>
  )
}
