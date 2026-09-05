import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from './apiBase'
import { Badge, PageHeader, btnSecondary, cardClass, fieldClass, tableWrapClass } from './ui'

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('nexusops_token') ?? ''}` }
}

type AuditLog = {
  id: number
  action: string
  resource: string
  resource_id?: string | null
  details?: string | null
  source: string
  success: boolean
  created_at: string
  user_id?: number | null
  username?: string | null
}

type AppLog = {
  id?: number | null
  level: string
  logger: string
  message: string
  created_at: string
}

function levelTone(level: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  const value = level.toUpperCase()
  if (value === 'ERROR' || value === 'CRITICAL') return 'danger'
  if (value === 'WARNING') return 'warning'
  if (value === 'INFO') return 'info'
  return 'neutral'
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [q, setQ] = useState('')
  const [resource, setResource] = useState('')
  const [outcome, setOutcome] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (event?: FormEvent) => {
    event?.preventDefault()
    setLoading(true)
    const params = new URLSearchParams({ limit: '200' })
    if (q.trim()) params.set('q', q.trim())
    if (resource) params.set('resource', resource)
    if (outcome === 'ok') params.set('success', 'true')
    if (outcome === 'fail') params.set('success', 'false')
    const r = await fetch(`${API_BASE_URL}/api/v1/audit?${params}`, { headers: authHeaders() })
    const data = r.ok ? await r.json() : []
    setLogs(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [outcome, q, resource])

  useEffect(() => {
    void load()
  }, [load])

  const resources = Array.from(new Set(logs.map((log) => log.resource))).sort()

  return (
    <section className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Operator actions recorded by NexusOps. Application stdout lives on the system log page."
        actions={
          <Link to="/logs/system" className="text-sm text-indigo-300 hover:text-indigo-200">
            Application logs
          </Link>
        }
      />

      <form onSubmit={load} className={`${cardClass} grid gap-3 md:grid-cols-[1fr_160px_140px_auto]`}>
        <div>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search action, resource, or details" className={fieldClass} />
        </div>
        <select value={resource} onChange={(event) => setResource(event.target.value)} className={fieldClass}>
          <option value="">All resources</option>
          {resources.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select value={outcome} onChange={(event) => setOutcome(event.target.value)} className={fieldClass}>
          <option value="">All results</option>
          <option value="ok">Success</option>
          <option value="fail">Failed</option>
        </select>
        <button type="submit" disabled={loading} className={btnSecondary}>
          {loading ? 'Loading…' : 'Filter'}
        </button>
      </form>

      <div className={tableWrapClass}>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#0b1220] text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Resource</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">No audit events match.</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-white">{log.action}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {log.resource}
                    {log.resource_id ? <span className="block text-[11px] text-slate-600">{log.resource_id}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{log.username || '—'}</td>
                  <td className="px-4 py-3"><Badge tone={log.success ? 'success' : 'danger'}>{log.success ? 'Success' : 'Failed'}</Badge></td>
                  <td className="max-w-md px-4 py-3 text-slate-400">{log.details || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function SystemLogs() {
  const [logs, setLogs] = useState<AppLog[]>([])
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (event?: FormEvent) => {
    event?.preventDefault()
    setLoading(true)
    const params = new URLSearchParams({ limit: '250' })
    if (q.trim()) params.set('q', q.trim())
    if (level) params.set('level', level)
    const r = await fetch(`${API_BASE_URL}/api/v1/logs/system?${params}`, { headers: authHeaders() })
    const data = r.ok ? await r.json() : []
    setLogs(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [level, q])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(id)
  }, [load])

  return (
    <section className="space-y-6">
      <PageHeader
        title="Application logs"
        description="Recent NexusOps backend messages. Secrets are redacted. Audit events for operator actions are separate."
        actions={
          <Link to="/logs/audit" className="text-sm text-indigo-300 hover:text-indigo-200">
            Audit log
          </Link>
        }
      />

      <form onSubmit={load} className={`${cardClass} grid gap-3 md:grid-cols-[1fr_160px_auto]`}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search log message" className={fieldClass} />
        <select value={level} onChange={(event) => setLevel(event.target.value)} className={fieldClass}>
          <option value="">All levels</option>
          <option value="INFO">Info</option>
          <option value="WARNING">Warning</option>
          <option value="ERROR">Error</option>
        </select>
        <button type="submit" disabled={loading} className={btnSecondary}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </form>

      <div className={tableWrapClass}>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#0b1220] text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Logger</th>
              <th className="px-4 py-3">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-slate-500">No application logs yet.</td>
              </tr>
            ) : (
              logs.map((log, index) => (
                <tr key={log.id ?? `${log.created_at}-${index}`} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3"><Badge tone={levelTone(log.level)}>{log.level}</Badge></td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{log.logger}</td>
                  <td className="max-w-3xl px-4 py-3 font-mono text-xs text-slate-200 break-all">{log.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
