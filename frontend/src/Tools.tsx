import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { API_BASE_URL, authHeaders } from './api/client'
import { breadcrumbsFor } from './layout/navigation'
import { PageHeader } from './ui/page'
import { toast } from './ui/toast'

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
    badgeColor: 'bg-accent/15 text-accent',
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
    badgeColor: 'bg-accent/15 text-accent',
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
    badgeColor: 'bg-accent/15 text-accent',
    external: true,
  },
]

const CATEGORY_COLORS: Record<string, string> = {
  Identity:  'bg-accent/15 text-accent border-accent/30',
  Developer: 'bg-accent/15 text-accent border-accent/30',
  Network:   'bg-accent/15 text-accent border-accent/30',
  Security:  'bg-danger/15 text-danger border-danger/30',
  Monitoring:'bg-ok/15 text-ok border-ok/30',
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
      if (data.status === 'ok') toast.ok(`${serverName} is online`)
      else toast.error(data.message ?? 'LDAP test failed')
    } finally { setTesting(null) }
  }

  const categories = [...new Set(BUNDLED_TOOLS.map((t) => t.category))]

  return (
    <section className="space-y-8">
      <PageHeader crumbs={breadcrumbsFor('/tools')} title="Tools & Integrations" description="All bundled services and external tools accessible from one place." />

      {ldapServers.length > 0 && (
        <div>
          <h3 className="mb-4 text-sm font-semibold text-muted uppercase tracking-[0.15em]">Connected LDAP Directories</h3>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ldapServers.map((svr) => {
              const testRes = testResults[svr.name]
              const status = testRes ? (testRes === 'ok' ? 'ok' : 'error') : svr.last_test_status
              return (
                <div key={svr.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-ink">{svr.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted">{svr.host}:{svr.port}</div>
                    </div>
                    {status && (
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${status === 'ok' ? 'bg-ok/15 text-ok border-ok/30' : 'bg-danger/15 text-danger border-danger/30'}`}>
                        {status === 'ok' ? '✓ Online' : '✗ Error'}
                      </span>
                    )}
                  </div>
                  {testRes && testRes !== 'ok' && <p className="mt-2 rounded-xl bg-danger/10 px-2 py-1 text-[11px] text-danger">{testRes}</p>}
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => handleTestLdap(svr.id, svr.name)} disabled={testing === svr.name} className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-60">
                      {testing === svr.name ? '⟳ Testing…' : '⟳ Test'}
                    </button>
                    <Link to="/ldap" className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-muted transition hover:bg-elevated">
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
            <h3 className="text-sm font-semibold text-muted uppercase tracking-[0.15em]">{cat}</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[cat] ?? 'bg-elevated text-muted'}`}>{cat}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {BUNDLED_TOOLS.filter((t) => t.category === cat).map((tool) => {
              const className = 'group rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-1 hover:border-accent/40'
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-base font-bold text-ink transition group-hover:bg-elevated">
                      {tool.icon}
                    </div>
                    {tool.badge && (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tool.badgeColor ?? 'bg-elevated text-muted'}`}>{tool.badge}</span>
                    )}
                  </div>
                  <h4 className="mt-3 text-base font-semibold text-ink">{tool.name}</h4>
                  <p className="mt-1 text-sm text-muted">{tool.description}</p>
                  <div className="mt-4 flex items-center gap-1 text-[11px] text-faint transition group-hover:text-accent">
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

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="mb-2 text-sm font-semibold text-ink">Bundled directory accounts</h3>
        <p className="text-sm text-muted">
          Default LDAP users are documented in the repository README and <span className="text-accent">.env.example</span>.
          Manage them from the Directory Manager. Change all bundled passwords before any networked deployment.
        </p>
      </div>
    </section>
  )
}
