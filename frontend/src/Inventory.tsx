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
  active:        'bg-ok/15 text-ok',
  inactive:      'bg-elevated text-muted',
  decommissioned:'bg-danger/15 text-danger',
  unknown:       'bg-warn/15 text-warn',
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_COLORS[status] ?? 'bg-elevated text-muted'}`}>{status}</span>
}

const TAG_COLORS: Record<string, string> = {
  cyan:   'bg-accent/15 text-accent border-accent/30',
  violet: 'bg-accent/15 text-accent border-accent/30',
  emerald:'bg-ok/15 text-ok border-ok/30',
  amber:  'bg-warn/15 text-warn border-warn/30',
  rose:   'bg-danger/15 text-danger border-danger/30',
  sky:    'bg-accent/15 text-accent border-accent/30',
  indigo: 'bg-accent/15 text-accent border-accent/30',
}

function TagPill({ tag }: { tag: HostTag }) {
  const cls = TAG_COLORS[tag.color] ?? 'bg-elevated/50 text-muted border-line'
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{tag.name}</span>
}

const input = 'w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent/20'
const select = 'w-full rounded-2xl border border-line bg-canvas px-3 py-2.5 text-ink outline-none focus:border-accent'
const section = 'rounded-2xl border border-line bg-surface p-5 shadow-card'
const label = 'mb-2 block text-sm font-medium text-ink'

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
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Infrastructure / Inventory</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">Hosts</h2>
          <p className="mt-2 text-muted">Registry of all managed and discovered devices across your homelab.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleImport} disabled={importing} className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-60">
            {importing ? 'Importing…' : '⟳ Import from IPAM'}
          </button>
          <button onClick={() => { if (showAdd) resetForm(); else setShowAdd(true) }} className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:opacity-90">
            {showAdd ? '✕ Cancel' : '+ Add host'}
          </button>
        </div>
      </div>

      {importMsg && <p className={`rounded-2xl px-3 py-2 text-sm ${importMsg.includes('failed') ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'}`}>{importMsg}</p>}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Total', value: statCounts.total, badge: 'bg-elevated text-muted' },
          { label: 'Active', value: statCounts.active, badge: 'bg-ok/15 text-ok' },
          { label: 'Inactive', value: statCounts.inactive, badge: 'bg-elevated text-muted' },
          { label: 'Unknown', value: statCounts.unknown, badge: 'bg-warn/15 text-warn' },
        ].map(({ label: l, value: v, badge }) => (
          <div key={l} className={`${section} flex items-center justify-between`}>
            <div>
              <div className="text-2xl font-bold text-ink">{v}</div>
              <div className="mt-0.5 text-xs text-muted">{l}</div>
            </div>
            <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${badge}`}>{l}</span>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-3">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by hostname, IP, FQDN, role…" className="flex-1 min-w-[200px] rounded-2xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-accent" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-2xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-accent">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="decommissioned">Decommissioned</option>
          <option value="unknown">Unknown</option>
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="rounded-2xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-accent">
          <option value="">All tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="rounded-2xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-accent">
          <option value="">All groups</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* add form */}
      {showAdd && (
        <form onSubmit={handleSubmit} className={`${section} grid gap-4 md:grid-cols-2 xl:grid-cols-3`}>
          <div className="md:col-span-2 xl:col-span-3">
            <p className="text-base font-semibold text-ink">{editingId ? 'Edit host' : 'Add host'}</p>
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
                  <button key={t.id} type="button" onClick={() => toggleTag(t.id)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selectedTags.includes(t.id) ? (TAG_COLORS[t.color] ?? 'bg-elevated text-ink border-line') : 'border-line bg-canvas text-muted hover:border-muted'}`}>
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
                  <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selectedGroups.includes(g.id) ? 'border-accent/50 bg-accent/15 text-accent' : 'border-line bg-canvas text-muted hover:border-muted'}`}>
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="md:col-span-2 xl:col-span-3 rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="md:col-span-2 xl:col-span-3 flex justify-end">
            <button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 font-semibold text-accent-fg shadow-sm transition hover:opacity-90">{editingId ? 'Save changes' : 'Save host'}</button>
          </div>
        </form>
      )}

      {/* table */}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="min-w-full divide-y divide-line text-left text-sm">
          <thead className="bg-canvas/80 text-muted">
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
          <tbody className="divide-y divide-line bg-surface/70">
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-muted">
                {hosts.length === 0 ? 'No hosts yet. Add one or import from IPAM scan results.' : 'No hosts match the current filter.'}
              </td></tr>
            ) : filtered.map((host) => (
              <tr key={host.id} className="hover:bg-elevated/70">
                <td className="px-4 py-4">
                  <div className="font-semibold text-ink">{host.hostname}</div>
                  {host.fqdn && <div className="font-mono text-[11px] text-muted">{host.fqdn}</div>}
                </td>
                <td className="px-4 py-4 font-mono text-ink">{host.ip_address ?? '—'}</td>
                <td className="px-4 py-4">
                  {host.os && <div className="text-ink">{host.os}</div>}
                  {host.role && <div className="text-xs text-muted">{host.role}</div>}
                  {!host.os && !host.role && <span className="text-faint">—</span>}
                </td>
                <td className="px-4 py-4 text-muted">{host.location ?? '—'}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {host.tags.length === 0 ? <span className="text-faint">—</span> : host.tags.map((t) => <TagPill key={t.id} tag={t} />)}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {host.groups.length === 0 ? <span className="text-faint">—</span> : host.groups.map((g) => (
                      <span key={g.id} className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">{g.name}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4"><StatusBadge status={host.status} /></td>
                <td className="px-4 py-4 text-muted text-[11px]">{host.last_seen_at ? new Date(host.last_seen_at).toLocaleString() : '—'}</td>
                <td className="px-4 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => startEdit(host)} className="rounded-xl border border-line px-3 py-1 text-xs text-muted hover:bg-elevated">Edit</button>
                    <button onClick={() => handleDelete(host.id, host.hostname)} className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-1 text-xs text-danger transition hover:bg-danger/20">Delete</button>
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
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Infrastructure / Inventory</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">Tags</h2>
        <p className="mt-2 text-muted">Labels to categorise and filter hosts.</p>
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
              <button key={c} type="button" onClick={() => setColor(c)} className={`h-8 w-8 rounded-full transition ${TAG_COLORS[c]?.split(' ')[0] ?? ''} ${color === c ? 'ring-2 ring-ink ring-offset-1 ring-offset-canvas' : 'opacity-60 hover:opacity-100'}`} title={c} />
            ))}
          </div>
        </div>
        {error && <p className="w-full rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 font-semibold text-accent-fg transition hover:opacity-90">Add tag</button>
      </form>
      <div className="flex flex-wrap gap-3">
        {tags.length === 0 ? <p className="text-muted">No tags yet.</p> : tags.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${TAG_COLORS[t.color] ?? 'bg-elevated text-muted border-line'}`}>
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
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Infrastructure / Inventory</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">Groups</h2>
        <p className="mt-2 text-muted">Logical host groupings for bulk operations and filtering.</p>
      </div>
      <form onSubmit={handleSubmit} className={`${section} grid gap-4 md:grid-cols-2`}>
        <div><label className={label}>Group name</label><input value={name} onChange={(e) => setName(e.target.value)} required className={input} /></div>
        <div><label className={label}>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className={input} /></div>
        {error && <p className="md:col-span-2 rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" className="rounded-2xl bg-accent px-5 py-2.5 font-semibold text-accent-fg shadow-sm transition hover:opacity-90">Add group</button>
        </div>
      </form>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <table className="min-w-full divide-y divide-line text-left text-sm">
          <thead className="bg-canvas/80 text-muted">
            <tr><th className="px-4 py-3 font-medium">Group</th><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">Created</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface/70">
            {groups.length === 0 ? <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No groups yet.</td></tr>
              : groups.map((g) => (
                <tr key={g.id} className="hover:bg-elevated/70">
                  <td className="px-4 py-4 font-semibold text-ink">{g.name}</td>
                  <td className="px-4 py-4 text-muted">{g.description ?? '—'}</td>
                  <td className="px-4 py-4 text-muted">{new Date(g.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-4 text-right"><button onClick={() => handleDelete(g.id, g.name)} className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-1 text-xs text-danger hover:bg-danger/20">Delete</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
