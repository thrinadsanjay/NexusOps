import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { API_BASE_URL, authHeaders } from './api/client'

type Tool = {
  id: string
  name: string
  description: string
  url: string
  category: string
  icon: string
  badge?: string
  badgeColor?: string
  external: boolean
}

const apiOrigin = API_BASE_URL.replace(/\/$/, '')

const BUNDLED_TOOLS: Tool[] = [
  {
    id: 'directory',
    name: 'Directory Manager',
    description: 'Create and manage LDAP users, groups, and OUs from inside NexusOps.',
    url: '/ldap',
    category: 'Identity',
    icon: 'L',
    badge: 'Built-in',
    badgeColor: 'bg-sky-500/15 text-sky-300',
    external: false,
  },
  {
    id: 'apidocs',
    name: 'API Documentation',
    description: 'Interactive FastAPI OpenAPI docs for all NexusOps backend endpoints.',
    url: `${apiOrigin}/docs`,
    category: 'Developer',
    icon: 'D',
    badge: 'Built-in',
    badgeColor: 'bg-violet-500/15 text-violet-300',
    external: true,
  },
  {
    id: 'apiredoc',
    name: 'API Reference (Redoc)',
    description: 'ReDoc-style API reference with detailed schema documentation.',
    url: `${apiOrigin}/redoc`,
    category: 'Developer',
    icon: 'R',
    badge: 'Built-in',
    badgeColor: 'bg-violet-500/15 text-violet-300',
    external: true,
  },
]

const CATEGORY_COLORS: Record<string, string> = {
  Identity:  'bg-sky-500/15 text-sky-300 border-sky-500/30',
  Developer: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Network:   'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  Security:  'bg-rose-500/15 text-rose-300 border-rose-500/30',
  Monitoring:'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
}

type LdapServer = { id: number; name: string; host: string; port: number; last_test_status: string | null }

export function ToolsPanel() {
  const [ldapServers, setLdapServers] = useState<LdapServer[]>([])
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/ldap/servers`, { headers: authHeaders() })
      .then((r) => r.json()).then((data) => setLdapServers(Array.isArray(data) ? data : [])).catch(() => undefined)
  }, [])

  const handleTestLdap = async (serverId: number, serverName: string) => {
    setTesting(serverName)
    try {
      const r = await fetch(`${API_BASE_URL}/api/v1/ldap/servers/${serverId}/test`, { method: 'POST', headers: authHeaders() })
      const data = await r.json()
      setTestResults((p) => ({ ...p, [serverName]: data.status === 'ok' ? 'ok' : `error: ${data.message}` }))
      setLdapServers((p) => p.map((s) => s.id === serverId ? { ...s, last_test_status: data.status } : s))
    } finally { setTesting(null) }
  }

  const categories = [...new Set(BUNDLED_TOOLS.map((t) => t.category))]

  return (
    <section className="space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">NexusOps · Integrations</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Tools & Integrations</h2>
        <p className="mt-2 text-slate-300">All bundled services and external tools accessible from one place.</p>
      </div>

      {ldapServers.length > 0 && (
        <div>
          <h3 className="mb-4 text-sm font-semibold text-slate-300 uppercase tracking-[0.15em]">Connected LDAP Directories</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ldapServers.map((svr) => {
              const testRes = testResults[svr.name]
              const status = testRes ? (testRes === 'ok' ? 'ok' : 'error') : svr.last_test_status
              return (
                <div key={svr.id} className="rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{svr.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-400">{svr.host}:{svr.port}</div>
                    </div>
                    {status && (
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${status === 'ok' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}`}>
                        {status === 'ok' ? '✓ Online' : '✗ Error'}
                      </span>
                    )}
                  </div>
                  {testRes && testRes !== 'ok' && <p className="mt-2 rounded-xl bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">{testRes}</p>}
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => handleTestLdap(svr.id, svr.name)} disabled={testing === svr.name} className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-60">
                      {testing === svr.name ? '⟳ Testing…' : '⟳ Test'}
                    </button>
                    <Link to="/ldap" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800">
                      Open directory →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat}>
          <div className="mb-4 flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-[0.15em]">{cat}</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[cat] ?? 'bg-slate-700 text-slate-400'}`}>{cat}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {BUNDLED_TOOLS.filter((t) => t.category === cat).map((tool) => {
              const className = 'group rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)] transition hover:-translate-y-1 hover:border-slate-700'
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-base font-bold text-white transition group-hover:bg-slate-700">
                      {tool.icon}
                    </div>
                    {tool.badge && (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tool.badgeColor ?? 'bg-slate-700 text-slate-300'}`}>{tool.badge}</span>
                    )}
                  </div>
                  <h4 className="mt-3 text-base font-semibold text-white">{tool.name}</h4>
                  <p className="mt-1 text-sm text-slate-400">{tool.description}</p>
                  <div className="mt-4 flex items-center gap-1 text-[11px] text-slate-500 transition group-hover:text-cyan-400">
                    <span className="font-mono">{tool.url}</span>
                    <span>↗</span>
                  </div>
                </>
              )
              return tool.external ? (
                <a key={tool.id} href={tool.url} target="_blank" rel="noreferrer" className={className}>{body}</a>
              ) : (
                <Link key={tool.id} to={tool.url} className={className}>{body}</Link>
              )
            })}
          </div>
        </div>
      ))}

      <div className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-5">
        <h3 className="mb-2 text-sm font-semibold text-white">Bundled directory accounts</h3>
        <p className="text-sm text-slate-400">
          Default LDAP users are documented in the repository README and <span className="text-cyan-300">.env.example</span>.
          Manage them from the Directory Manager. Change all bundled passwords before any networked deployment.
        </p>
      </div>
    </section>
  )
}
