import { FormEvent, useCallback, useEffect, useState } from 'react'

import { API_BASE_URL, authHeaders } from './api/client'
import { confirmDelete } from './confirm'

// ── types ──────────────────────────────────────────────────────────────────

export type HostTag = { id: number; name: string; color: string }
export type HostGroup = { id: number; name: string; description: string | null; created_at: string }
export type Host = {
  id: number
  hostname: string
  fqdn: string | null
  ip_address: string | null
  mac_address: string | null
  os: string | null
  role: string | null
  status: string
  description: string | null
  notes: string | null
  location: string | null
  subnet_id: number | null
  last_seen_at: string | null
  tags: HostTag[]
  groups: HostGroup[]
}

// ── shared helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:        'bg-emerald-500/15 text-emerald-300',
  inactive:      'bg-slate-700 text-slate-400',
  decommissioned:'bg-rose-500/15 text-rose-300',
  unknown:       'bg-amber-500/15 text-amber-300',
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_COLORS[status] ?? 'bg-slate-700 text-slate-300'}`}>{status}</span>
}

const TAG_COLORS: Record<string, string> = {
  cyan:   'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  emerald:'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amber:  'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose:   'bg-rose-500/15 text-rose-300 border-rose-500/30',
  sky:    'bg-sky-500/15 text-sky-300 border-sky-500/30',
  indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
}

function TagPill({ tag }: { tag: HostTag }) {
  const cls = TAG_COLORS[tag.color] ?? 'bg-slate-700/50 text-slate-300 border-slate-700'
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{tag.name}</span>
}

const input = 'w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/20'
const select = 'w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none focus:border-cyan-400'
const section = 'rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]'
const label = 'mb-2 block text-sm font-medium text-slate-200'

// ── Hosts panel ────────────────────────────────────────────────────────────

export function HostsPanel() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [tags, setTags] = useState<HostTag[]>([])
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [tagFilter, setTagFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [error, setError] = useState('')

  // form state
  const [hostname, setHostname] = useState('')
  const [fqdn, setFqdn] = useState('')
  const [ip, setIp] = useState('')
  const [mac, setMac] = useState('')
  const [os, setOs] = useState('')
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [hostStatus, setHostStatus] = useState('active')
  const [selectedTags, setSelectedTags] = useState<number[]>([])
  const [selectedGroups, setSelectedGroups] = useState<number[]>([])

  const loadAll = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/inventory/hosts`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/inventory/tags`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/inventory/groups`, { headers: authHeaders() }).then((r) => r.json()),
    ]).then(([h, t, g]) => { setHosts(h); setTags(t); setGroups(g) }).catch(() => setError('Failed to load'))
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handleImport = async () => {
    setImporting(true); setImportMsg('')
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/inventory/hosts/import-from-ipam`, { method: 'POST', headers: authHeaders() })
      const data = await r.json()
      setImportMsg(`Imported ${data.imported} host${data.imported !== 1 ? 's' : ''} from IPAM`)
      loadAll()
    } catch { setImportMsg('Import failed') }
    finally { setImporting(false) }
  }

  const resetForm = () => {
    setHostname(''); setFqdn(''); setIp(''); setMac(''); setOs(''); setRole(''); setLocation(''); setDescription(''); setSelectedTags([]); setSelectedGroups([]); setHostStatus('active'); setEditingId(null); setShowAdd(false)
  }

  const startEdit = (host: Host) => {
    setEditingId(host.id); setShowAdd(true); setHostname(host.hostname); setFqdn(host.fqdn ?? ''); setIp(host.ip_address ?? ''); setMac(host.mac_address ?? ''); setOs(host.os ?? ''); setRole(host.role ?? ''); setLocation(host.location ?? ''); setDescription(host.description ?? ''); setHostStatus(host.status); setSelectedTags(host.tags.map((t) => t.id)); setSelectedGroups(host.groups.map((g) => g.id))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const body = { hostname, fqdn: fqdn || null, ip_address: ip || null, mac_address: mac || null, os: os || null, role: role || null, location: location || null, description: description || null, status: hostStatus, tag_ids: selectedTags, group_ids: selectedGroups }
    const res = await fetch(editingId ? `${API_BASE_URL}/api/v1/inventory/hosts/${editingId}` : `${API_BASE_URL}/api/v1/inventory/hosts`, {
      method: editingId ? 'PATCH' : 'POST', headers: authHeaders(),
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.detail ?? 'Failed'); return }
    if (editingId) setHosts((p) => p.map((h) => h.id === editingId ? data : h).sort((a, b) => a.hostname.localeCompare(b.hostname)))
    else setHosts((p) => [...p, data].sort((a, b) => a.hostname.localeCompare(b.hostname)))
    resetForm()
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirmDelete(`host "${name}"`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/inventory/hosts/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) setHosts((p) => p.filter((h) => h.id !== id))
  }

  const toggleTag = (id: number) => setSelectedTags((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  const toggleGroup = (id: number) => setSelectedGroups((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])

  const filtered = hosts.filter((h) => {
    const q = filter.toLowerCase()
    const matchesText = !q || h.hostname.toLowerCase().includes(q) || (h.ip_address ?? '').includes(q) || (h.fqdn ?? '').toLowerCase().includes(q) || (h.role ?? '').toLowerCase().includes(q)
    const matchesStatus = !statusFilter || h.status === statusFilter
    const matchesTag = !tagFilter || h.tags.some((t) => String(t.id) === tagFilter)
    const matchesGroup = !groupFilter || h.groups.some((g) => String(g.id) === groupFilter)
    return matchesText && matchesStatus && matchesTag && matchesGroup
  })

  const statCounts = {
    total: hosts.length,
    active: hosts.filter((h) => h.status === 'active').length,
    inactive: hosts.filter((h) => h.status === 'inactive').length,
    unknown: hosts.filter((h) => h.status === 'unknown').length,
  }

  return (
    <section className="space-y-6">
      {/* header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Infrastructure / Inventory</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Hosts</h2>
          <p className="mt-2 text-slate-300">Registry of all managed and discovered devices across your homelab.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleImport} disabled={importing} className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-60">
            {importing ? 'Importing…' : '⟳ Import from IPAM'}
          </button>
          <button onClick={() => { if (showAdd) resetForm(); else setShowAdd(true) }} className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110">
            {showAdd ? '✕ Cancel' : '+ Add host'}
          </button>
        </div>
      </div>

      {importMsg && <p className={`rounded-2xl px-3 py-2 text-sm ${importMsg.includes('failed') ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{importMsg}</p>}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Total', value: statCounts.total, badge: 'bg-slate-700 text-slate-300' },
          { label: 'Active', value: statCounts.active, badge: 'bg-emerald-500/15 text-emerald-300' },
          { label: 'Inactive', value: statCounts.inactive, badge: 'bg-slate-700 text-slate-400' },
          { label: 'Unknown', value: statCounts.unknown, badge: 'bg-amber-500/15 text-amber-300' },
        ].map(({ label: l, value: v, badge }) => (
          <div key={l} className={`${section} flex items-center justify-between`}>
            <div>
              <div className="text-2xl font-bold text-white">{v}</div>
              <div className="mt-0.5 text-xs text-slate-400">{l}</div>
            </div>
            <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badge}`}>{l}</span>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-3">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by hostname, IP, FQDN, role…" className="flex-1 min-w-[200px] rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="decommissioned">Decommissioned</option>
          <option value="unknown">Unknown</option>
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400">
          <option value="">All tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400">
          <option value="">All groups</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* add form */}
      {showAdd && (
        <form onSubmit={handleSubmit} className={`${section} grid gap-4 md:grid-cols-2 xl:grid-cols-3`}>
          <div className="md:col-span-2 xl:col-span-3">
            <p className="text-base font-semibold text-white">{editingId ? 'Edit host' : 'Add host'}</p>
          </div>
          <div><label className={label}>Hostname *</label><input value={hostname} onChange={(e) => setHostname(e.target.value)} required className={input} /></div>
          <div><label className={label}>IP address</label><input value={ip} onChange={(e) => setIp(e.target.value)} className={`${input} font-mono`} /></div>
          <div><label className={label}>FQDN</label><input value={fqdn} onChange={(e) => setFqdn(e.target.value)} className={`${input} font-mono`} /></div>
          <div><label className={label}>MAC address</label><input value={mac} onChange={(e) => setMac(e.target.value)} className={`${input} font-mono`} /></div>
          <div><label className={label}>OS</label><input value={os} onChange={(e) => setOs(e.target.value)} placeholder="Ubuntu 24.04, Windows 11…" className={input} /></div>
          <div><label className={label}>Role</label><input value={role} onChange={(e) => setRole(e.target.value)} placeholder="router, server, printer…" className={input} /></div>
          <div><label className={label}>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Rack A, Living room…" className={input} /></div>
          <div><label className={label}>Status</label><select value={hostStatus} onChange={(e) => setHostStatus(e.target.value)} className={select}><option value="active">Active</option><option value="inactive">Inactive</option><option value="unknown">Unknown</option><option value="decommissioned">Decommissioned</option></select></div>
          <div><label className={label}>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className={input} /></div>

          {tags.length > 0 && (
            <div className="md:col-span-2 xl:col-span-3">
              <label className={label}>Tags</label>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <button key={t.id} type="button" onClick={() => toggleTag(t.id)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selectedTags.includes(t.id) ? (TAG_COLORS[t.color] ?? 'bg-slate-700 text-white border-slate-500') : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500'}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {groups.length > 0 && (
            <div className="md:col-span-2 xl:col-span-3">
              <label className={label}>Groups</label>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selectedGroups.includes(g.id) ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500'}`}>
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="md:col-span-2 xl:col-span-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          <div className="md:col-span-2 xl:col-span-3 flex justify-end">
            <button type="submit" className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110">{editingId ? 'Save changes' : 'Save host'}</button>
          </div>
        </form>
      )}

      {/* table */}
      <div className="overflow-x-auto rounded-[26px] border border-slate-800 bg-slate-900/80 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/80 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">Hostname</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">OS / Role</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Groups</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                {hosts.length === 0 ? 'No hosts yet. Add one or import from IPAM scan results.' : 'No hosts match the current filter.'}
              </td></tr>
            ) : filtered.map((host) => (
              <tr key={host.id} className="hover:bg-slate-800/50">
                <td className="px-4 py-4">
                  <div className="font-semibold text-white">{host.hostname}</div>
                  {host.fqdn && <div className="font-mono text-[11px] text-slate-400">{host.fqdn}</div>}
                </td>
                <td className="px-4 py-4 font-mono text-slate-200">{host.ip_address ?? '—'}</td>
                <td className="px-4 py-4">
                  {host.os && <div className="text-slate-200">{host.os}</div>}
                  {host.role && <div className="text-xs text-slate-400">{host.role}</div>}
                  {!host.os && !host.role && <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-4 text-slate-300">{host.location ?? '—'}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {host.tags.length === 0 ? <span className="text-slate-500">—</span> : host.tags.map((t) => <TagPill key={t.id} tag={t} />)}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {host.groups.length === 0 ? <span className="text-slate-500">—</span> : host.groups.map((g) => (
                      <span key={g.id} className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-300">{g.name}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4"><StatusBadge status={host.status} /></td>
                <td className="px-4 py-4 text-slate-400 text-[11px]">{host.last_seen_at ? new Date(host.last_seen_at).toLocaleString() : '—'}</td>
                <td className="px-4 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => startEdit(host)} className="rounded-xl border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800">Edit</button>
                    <button onClick={() => handleDelete(host.id, host.hostname)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 transition hover:bg-rose-500/20">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Tags panel ──────────────────────────────────────────────────────────────

export function TagsPanel() {
  const [tags, setTags] = useState<HostTag[]>([])
  const [name, setName] = useState('')
  const [color, setColor] = useState('cyan')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/inventory/tags`, { headers: authHeaders() })
      .then((r) => r.json()).then(setTags).catch(() => setError('Failed to load'))
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const r = await fetch(`${API_BASE_URL}/api/v1/inventory/tags`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, color }) })
    const data = await r.json()
    if (!r.ok) { setError(data.detail ?? 'Failed'); return }
    setTags((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)))
    setName(''); setColor('cyan')
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirmDelete(`tag "${name}"`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/inventory/tags/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) setTags((p) => p.filter((t) => t.id !== id))
  }

  const COLOR_OPTIONS = ['cyan', 'violet', 'emerald', 'amber', 'rose', 'sky', 'indigo']

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Infrastructure / Inventory</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Tags</h2>
        <p className="mt-2 text-slate-300">Labels to categorise and filter hosts.</p>
      </div>
      <form onSubmit={handleSubmit} className={`${section} flex flex-wrap items-end gap-4`}>
        <div className="flex-1 min-w-[160px]">
          <label className={label}>Tag name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={input} />
        </div>
        <div className="min-w-[160px]">
          <label className={label}>Colour</label>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`h-8 w-8 rounded-full transition ${TAG_COLORS[c]?.split(' ')[0] ?? ''} ${color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-950' : 'opacity-60 hover:opacity-100'}`} title={c} />
            ))}
          </div>
        </div>
        {error && <p className="w-full rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <button type="submit" className="rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:brightness-110">Add tag</button>
      </form>
      <div className="flex flex-wrap gap-3">
        {tags.length === 0 ? <p className="text-slate-400">No tags yet.</p> : tags.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${TAG_COLORS[t.color] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
            <span className="text-sm font-medium">{t.name}</span>
            <button onClick={() => handleDelete(t.id, t.name)} className="text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Groups panel ────────────────────────────────────────────────────────────

export function GroupsPanel() {
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/inventory/groups`, { headers: authHeaders() })
      .then((r) => r.json()).then(setGroups).catch(() => setError('Failed to load'))
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    const r = await fetch(`${API_BASE_URL}/api/v1/inventory/groups`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name, description: description || null }) })
    const data = await r.json()
    if (!r.ok) { setError(data.detail ?? 'Failed'); return }
    setGroups((p) => [...p, data].sort((a, b) => a.name.localeCompare(b.name)))
    setName(''); setDescription('')
  }

  const handleDelete = async (id: number, groupName: string) => {
    if (!confirmDelete(`group "${groupName}"`)) return
    const r = await fetch(`${API_BASE_URL}/api/v1/inventory/groups/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) setGroups((p) => p.filter((g) => g.id !== id))
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Infrastructure / Inventory</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Groups</h2>
        <p className="mt-2 text-slate-300">Logical host groupings for bulk operations and filtering.</p>
      </div>
      <form onSubmit={handleSubmit} className={`${section} grid gap-4 md:grid-cols-2`}>
        <div><label className={label}>Group name</label><input value={name} onChange={(e) => setName(e.target.value)} required className={input} /></div>
        <div><label className={label}>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className={input} /></div>
        {error && <p className="md:col-span-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" className="rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-2.5 font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:brightness-110">Add group</button>
        </div>
      </form>
      <div className="overflow-hidden rounded-[26px] border border-slate-800 bg-slate-900/80">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/80 text-slate-300">
            <tr><th className="px-4 py-3 font-medium">Group</th><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">Created</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {groups.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No groups yet.</td></tr>
              : groups.map((g) => (
                <tr key={g.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-4 font-semibold text-white">{g.name}</td>
                  <td className="px-4 py-4 text-slate-300">{g.description ?? '—'}</td>
                  <td className="px-4 py-4 text-slate-400">{new Date(g.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-4 text-right"><button onClick={() => handleDelete(g.id, g.name)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300 hover:bg-rose-500/20">Delete</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
