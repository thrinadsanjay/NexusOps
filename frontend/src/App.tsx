import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { API_BASE_URL } from './apiBase'
import { Sidebar, currentPageLabel } from './Sidebar'
import { IPAddressesPanel, NetworkOverview, SubnetsPanel, VLansPanel } from './Ipam'
import { GroupsPanel, HostsPanel, TagsPanel } from './Inventory'
import { DnsOverview } from './Dns'
import { DhcpPanel } from './Dhcp'
import { PkiPanel } from './Pki'
import { LdapPanel } from './Ldap'
import { ToolsPanel } from './Tools'

type AuthUser = {
  id: number
  email: string
  username: string
  full_name?: string | null
  is_active: boolean
  is_superuser: boolean
  created_at: string
}

type AuthResponse = {
  access_token: string
  token_type: string
  user: AuthUser
}

type Permission = {
  id: number
  name: string
  description?: string | null
}

type Role = {
  id: number
  name: string
  description?: string | null
  permissions: Permission[]
}

type UserRecord = {
  id: number
  email: string
  username: string
  full_name?: string | null
  is_active: boolean
  is_superuser: boolean
  created_at: string
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
}

type SettingEntry = {
  key: string
  value: string
  description?: string | null
}

type ApiToken = {
  id: number
  name: string
  prefix: string
  created_at: string
  expires_at?: string | null
  last_used_at?: string | null
  is_active: boolean
  token?: string
}

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('nexusops_token'))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const savedUser = localStorage.getItem('nexusops_user')
    return savedUser ? JSON.parse(savedUser) : null
  })
  const [users, setUsers] = useState<UserRecord[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  const isAuthenticated = Boolean(token && user)
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])

  useEffect(() => {
    if (!token) {
      setUser(null)
      localStorage.removeItem('nexusops_user')
      return
    }

    setLoading(true)
    fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Session expired')
        }
        const data = await response.json()
        setUser(data)
        localStorage.setItem('nexusops_user', JSON.stringify(data))
      })
      .catch(() => {
        setToken(null)
        setUser(null)
        localStorage.removeItem('nexusops_token')
        localStorage.removeItem('nexusops_user')
      })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return
    }

    const headers = {
      Authorization: `Bearer ${token}`,
    }

    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/users`, { headers, credentials: 'include' }),
      fetch(`${API_BASE_URL}/api/v1/roles`, { headers, credentials: 'include' }),
      fetch(`${API_BASE_URL}/api/v1/settings`, { headers, credentials: 'include' }),
      fetch(`${API_BASE_URL}/api/v1/audit`, { headers, credentials: 'include' }),
      fetch(`${API_BASE_URL}/api/v1/api-tokens`, { headers, credentials: 'include' }),
    ])
      .then(async ([userResponse, roleResponse, settingsResponse, auditResponse, tokensResponse]) => {
        if (!userResponse.ok || !roleResponse.ok || !settingsResponse.ok || !auditResponse.ok || !tokensResponse.ok) {
          throw new Error('Unable to load access data')
        }

        const [userData, roleData, settingData, auditData, tokenData] = await Promise.all([
          userResponse.json() as Promise<UserRecord[]>,
          roleResponse.json() as Promise<Role[]>,
          settingsResponse.json() as Promise<Record<string, string>>,
          auditResponse.json() as Promise<AuditLog[]>,
          tokensResponse.json() as Promise<ApiToken[]>,
        ])

        setUsers(userData)
        setRoles(roleData)
        setSettings(settingData)
        setAuditLogs(auditData)
        setApiTokens(tokenData)
      })
      .catch(() => {
        setError('Unable to load admin metadata')
      })
  }, [isAuthenticated, token])

  const handleLogin = async (username: string, password: string) => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.detail ?? 'Login failed')
      }

      const auth: AuthResponse = payload
      localStorage.setItem('nexusops_token', auth.access_token)
      localStorage.setItem('nexusops_user', JSON.stringify(auth.user))
      setToken(auth.access_token)
      setUser(auth.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token ?? ''}`,
      },
      credentials: 'include',
    }).catch(() => undefined)

    localStorage.removeItem('nexusops_token')
    localStorage.removeItem('nexusops_user')
    setToken(null)
    setUser(null)
    setUsers([])
    setRoles([])
  }

  const handleCreateUser = async (payload: { email: string; username: string; full_name: string; password: string }) => {
    if (!token) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail ?? 'Unable to create user')
      }

      setUsers((currentUsers) => [data, ...currentUsers])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create user')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSetting = async (key: string, value: string, description?: string) => {
    if (!token) {
      return
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify({ key, value, description }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail ?? 'Unable to update setting')
    }

    setSettings((currentSettings) => ({ ...currentSettings, [key]: value }))
  }

  const handleCreateToken = async (name: string, expiresDays: number) => {
    if (!token) {
      return
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/api-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'include',
      body: JSON.stringify({ name, expires_days: expiresDays }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.detail ?? 'Unable to create token')
    }

    setApiTokens((currentTokens) => [
      {
        id: Date.now(),
        name,
        prefix: data.prefix,
        created_at: new Date().toISOString(),
        expires_at: data.expires_at,
        is_active: true,
        token: data.token,
      },
      ...currentTokens,
    ])

    return data.token as string
  }

  const renderRoutes = () => (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login onSubmit={handleLogin} loading={loading} error={error} />} />
      <Route path="/" element={isAuthenticated ? <Overview user={user!} /> : <Navigate to="/login" replace />} />
      <Route path="/users" element={isAuthenticated ? <UsersPanel users={users} onCreateUser={handleCreateUser} /> : <Navigate to="/login" replace />} />
      <Route path="/roles" element={isAuthenticated ? <RolesPanel roles={roles} /> : <Navigate to="/login" replace />} />
      <Route path="/ipam/vlans" element={isAuthenticated ? <VLansPanel /> : <Navigate to="/login" replace />} />
      <Route path="/ipam/subnets" element={isAuthenticated ? <SubnetsPanel /> : <Navigate to="/login" replace />} />
      <Route path="/ipam/addresses" element={isAuthenticated ? <IPAddressesPanel /> : <Navigate to="/login" replace />} />
      <Route path="/ipam" element={isAuthenticated ? <NetworkOverview /> : <Navigate to="/login" replace />} />
      <Route path="/inventory" element={isAuthenticated ? <HostsPanel /> : <Navigate to="/login" replace />} />
      <Route path="/inventory/tags" element={isAuthenticated ? <TagsPanel /> : <Navigate to="/login" replace />} />
      <Route path="/inventory/groups" element={isAuthenticated ? <GroupsPanel /> : <Navigate to="/login" replace />} />
      <Route path="/dns" element={isAuthenticated ? <DnsOverview /> : <Navigate to="/login" replace />} />
      <Route path="/dhcp" element={isAuthenticated ? <DhcpPanel /> : <Navigate to="/login" replace />} />
      <Route path="/pki" element={isAuthenticated ? <PkiPanel /> : <Navigate to="/login" replace />} />
      <Route path="/ldap" element={isAuthenticated ? <LdapPanel /> : <Navigate to="/login" replace />} />
      <Route path="/tools" element={isAuthenticated ? <ToolsPanel /> : <Navigate to="/login" replace />} />
      <Route
        path="/settings"
        element={
          isAuthenticated ? (
            <SettingsPanel
              settings={settings}
              auditLogs={auditLogs}
              apiTokens={apiTokens}
              onSaveSetting={handleSaveSetting}
              onCreateToken={handleCreateToken}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
    </Routes>
  )

  return (
    <div className="min-h-screen bg-[#0f1419] text-slate-100">
      {isAuthenticated ? (
        <div className="flex min-h-screen">
          <Sidebar
            userName={user?.full_name || user?.username || 'Operator'}
            userRole={user?.is_superuser ? 'Administrator' : 'Operator'}
            onLogout={handleLogout}
            mobileOpen={mobileNavOpen}
            onCloseMobile={closeMobileNav}
          />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <header className="flex h-14 items-center justify-between border-b border-white/10 bg-[#111827] px-4 lg:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-200 lg:hidden"
                  onClick={() => setMobileNavOpen(true)}
                >
                  Menu
                </button>
                <p className="text-sm font-medium text-slate-200">{currentPageLabel(location.pathname)}</p>
              </div>
              <p className="truncate text-sm text-slate-500">{user?.email}</p>
            </header>
            <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">{renderRoutes()}</main>
          </div>
        </div>
      ) : (
        <main className="min-h-screen">{renderRoutes()}</main>
      )}
    </div>
  )
}

type LoginProps = {
  onSubmit: (username: string, password: string) => Promise<void> | void
  loading: boolean
  error: string
}

function Login({ onSubmit, loading, error }: LoginProps) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('ChangeMe123!')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await onSubmit(username, password)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#111827] shadow-2xl md:grid-cols-[1.05fr_0.95fr]">
        <div className="bg-[#0b1220] p-8 md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-300">
            Secure access
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white">Welcome back</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-400">
            Sign in to manage infrastructure, identity, and platform operations from one control plane.
          </p>
          <div className="mt-8 space-y-3 text-sm text-slate-300">
            {['Role-based access control', 'Audit log and API tokens', 'Network, DNS, DHCP, and directory'].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <span className="inline-flex h-2 w-2 rounded-full bg-indigo-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 md:p-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              N
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">NexusOps</p>
              <h2 className="text-2xl font-semibold text-white">Sign in</h2>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-200">
                Username or email
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-3 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-3 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3.5 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Overview({ user }: { user: AuthUser }) {
  const greeting = useMemo(() => user.full_name || user.username || 'Operator', [user])
  const token = localStorage.getItem('nexusops_token') ?? ''

  type Stats = {
    auth: { total_users: number; active_users: number; total_roles: number; total_permissions: number; active_tokens: number }
    ipam: { total_vlans: number; total_subnets: number; assigned_ips: number; total_ips: number }
    inventory: { total_hosts: number; active_hosts: number; unknown_hosts: number }
    dns: { total_zones: number; forward_zones: number; total_records: number }
    dhcp: { total_servers: number; total_pools: number; active_leases: number; total_reservations: number }
    audit: { id: number; action: string; resource: string; success: boolean; created_at: string }[]
  }

  const [stats, setStats] = useState<Stats | null>(null)

  const loadStats = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/dashboard/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setStats).catch(() => undefined)
  }, [API_BASE_URL, token])

  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 30000)
    return () => clearInterval(id)
  }, [loadStats])

  const moduleCards = [
    { title: 'Network / IPAM', to: '/ipam', icon: 'N', desc: 'Subnets, VLANs, IP registry', stat: stats ? `${stats.ipam.total_subnets} subnets · ${stats.ipam.assigned_ips} IPs` : '—', panel: 'from-indigo-500/15 to-transparent border-indigo-500/20', badge: 'bg-indigo-500/15 text-indigo-300' },
    { title: 'Inventory', to: '/inventory', icon: 'I', desc: 'Hosts, groups, tags', stat: stats ? `${stats.inventory.active_hosts} active · ${stats.inventory.total_hosts} total` : '—', panel: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30', badge: 'bg-emerald-500/15 text-emerald-300' },
    { title: 'DNS', to: '/dns', icon: 'D', desc: 'Zones and records', stat: stats ? `${stats.dns.total_zones} zones · ${stats.dns.total_records} records` : '—', panel: 'from-indigo-500/20 to-indigo-500/5 border-indigo-500/30', badge: 'bg-indigo-500/15 text-indigo-300' },
    { title: 'DHCP', to: '/dhcp', icon: 'H', desc: 'Leases and reservations', stat: stats ? `${stats.dhcp.active_leases} active leases · ${stats.dhcp.total_reservations} static` : '—', panel: 'from-amber-500/20 to-amber-500/5 border-amber-500/30', badge: 'bg-amber-500/15 text-amber-300' },
    { title: 'PKI', to: '/pki', icon: 'P', desc: 'Certificates and CAs', stat: stats ? `${(stats as any).pki?.active_certs ?? 0} active · ${(stats as any).pki?.expiring_30d ?? 0} expiring` : '—', panel: 'from-rose-500/20 to-rose-500/5 border-rose-500/30', badge: 'bg-rose-500/15 text-rose-300' },
    { title: 'LDAP', to: '/ldap', icon: 'L', desc: 'Directory integration & user sync', stat: 'Browse · Sync · Import', panel: 'from-sky-500/20 to-sky-500/5 border-sky-500/30', badge: 'bg-sky-500/15 text-sky-300' },
    { title: 'Users', to: '/users', icon: 'U', desc: 'Local accounts and RBAC', stat: stats ? `${stats.auth.active_users} active · ${stats.auth.total_roles} roles` : '—', panel: 'from-violet-500/20 to-violet-500/5 border-violet-500/30', badge: 'bg-violet-500/15 text-violet-300' },
    { title: 'Settings', to: '/settings', icon: 'S', desc: 'Platform config and API tokens', stat: stats ? `${stats.auth.active_tokens} active tokens` : '—', panel: 'from-slate-700/40 to-slate-800/20 border-slate-700/60', badge: 'bg-slate-700 text-slate-300' },
  ] as const

  const kpis = stats ? [
    { label: 'Hosts', value: stats.inventory.total_hosts, sub: `${stats.inventory.active_hosts} active`, badge: 'bg-emerald-500/15 text-emerald-300' },
    { label: 'Subnets', value: stats.ipam.total_subnets, sub: `${stats.ipam.assigned_ips} IPs assigned`, badge: 'bg-indigo-500/15 text-indigo-300' },
    { label: 'DNS records', value: stats.dns.total_records, sub: `${stats.dns.total_zones} zones`, badge: 'bg-indigo-500/15 text-indigo-300' },
    { label: 'DHCP leases', value: stats.dhcp.active_leases, sub: `${stats.dhcp.total_reservations} static`, badge: 'bg-amber-500/15 text-amber-300' },
  ] : []

  return (
    <section className="space-y-6">
      {/* hero */}
      <div className="rounded-[30px] border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-indigo-300">Operations overview</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">Welcome, {greeting}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              All systems online
            </div>
            <button onClick={loadStats} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800">⟳ Refresh</button>
          </div>
        </div>
      </div>

      {/* live KPI strip */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats === null ? (
          [0,1,2,3].map((i) => <div key={i} className="h-24 animate-pulse rounded-[24px] border border-slate-800 bg-slate-900/80" />)
        ) : kpis.map(({ label, value, sub, badge }) => (
          <div key={label} className="rounded-[24px] border border-slate-800 bg-slate-900/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
            <div className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${badge}`}>{label}</div>
            <div className="mt-4 text-3xl font-bold text-white">{value}</div>
            <div className="mt-1 text-xs text-slate-400">{sub}</div>
          </div>
        ))}
      </div>

      {/* module cards + audit feed */}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {moduleCards.map(({ title, to, icon, desc, stat, panel, badge }) => (
            <Link key={title} to={to} className={`rounded-[26px] border bg-gradient-to-br ${panel} p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)] transition hover:-translate-y-1`}>
              <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${badge}`}>
                <span className="text-base font-bold text-white">{icon}</span>
              </div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="mt-1 text-sm text-slate-400">{desc}</p>
              <p className="mt-3 text-xs font-medium text-slate-300">{stat}</p>
            </Link>
          ))}
        </div>

        {/* audit feed */}
        <div className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Recent activity</h3>
            <Link to="/settings" className="text-[11px] text-slate-400 hover:text-indigo-300">View all →</Link>
          </div>
          <div className="space-y-2">
            {!stats || stats.audit.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : stats.audit.map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-white">{log.action}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${log.success ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                    {log.success ? 'ok' : 'fail'}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">{log.resource}</div>
                <div className="mt-1 text-[10px] text-slate-600">{new Date(log.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function UsersPanel({
  users,
  onCreateUser,
}: {
  users: UserRecord[]
  onCreateUser: (payload: { email: string; username: string; full_name: string; password: string }) => Promise<void> | void
}) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email || !username || !password) {
      return
    }

    await onCreateUser({
      email,
      username,
      full_name: fullName,
      password,
    })

    setEmail('')
    setUsername('')
    setFullName('')
    setPassword('')
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-indigo-300">Access control</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Users</h2>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm text-slate-300">
          {users.length} total accounts
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)] md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Email</label>
          <input value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Username</label>
          <input value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Full name</label>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Password</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-500">Create user</button>
        </div>
      </form>

      <div className="overflow-hidden rounded-[26px] border border-slate-800 bg-slate-900/80 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-slate-950/80 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">No users yet.</td>
              </tr>
            ) : (
              users.map((userRecord) => (
                <tr key={userRecord.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-4">
                    <div className="font-medium text-white">{userRecord.full_name || userRecord.username}</div>
                    <div className="text-slate-400">{userRecord.email}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${userRecord.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                      {userRecord.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-300">{userRecord.is_superuser ? 'Admin' : 'User'}</td>
                  <td className="px-4 py-4 text-slate-300">{new Date(userRecord.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RolesPanel({ roles }: { roles: Role[] }) {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300">Role engine</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Roles</h2>
        <p className="mt-2 text-slate-300">Permission groups configured for the platform.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {roles.length === 0 ? (
          <div className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-6 text-slate-400 md:col-span-2">No roles returned yet.</div>
        ) : (
          roles.map((role) => (
            <div key={role.id} className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-white">{role.name}</h3>
                <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-300">{role.permissions.length} perms</span>
              </div>
              {role.description && <p className="mt-2 text-sm leading-6 text-slate-300">{role.description}</p>}
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                {role.permissions.length === 0 ? (
                  <li className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-500">No permissions assigned</li>
                ) : (
                  role.permissions.map((permission) => (
                    <li key={permission.id} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-200">
                      {permission.name}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function SettingsPanel({
  settings,
  auditLogs,
  apiTokens,
  onSaveSetting,
  onCreateToken,
}: {
  settings: Record<string, string>
  auditLogs: AuditLog[]
  apiTokens: ApiToken[]
  onSaveSetting: (key: string, value: string, description?: string) => Promise<void>
  onCreateToken: (name: string, expiresDays: number) => Promise<string | undefined>
}) {
  const [key, setKey] = useState('app_name')
  const [value, setValue] = useState('NexusOps')
  const [description, setDescription] = useState('Platform display name')
  const [tokenName, setTokenName] = useState('')
  const [expiresDays, setExpiresDays] = useState(30)
  const [newToken, setNewToken] = useState('')

  const handleSettingSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!key || !value) {
      return
    }

    await onSaveSetting(key, value, description)
    setKey('')
    setValue('')
    setDescription('')
  }

  const handleTokenSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!tokenName) {
      return
    }

    const token = await onCreateToken(tokenName, expiresDays)
    setNewToken(token ?? '')
    setTokenName('')
    setExpiresDays(30)
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">Security & controls</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Settings & access</h2>
        <p className="mt-2 text-slate-300">Platform defaults, audit review, and API token management.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleSettingSubmit} className="space-y-4 rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-white">Update setting</h3>
            <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-xs font-medium text-indigo-300">Live</span>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Key</label>
            <input value={key} onChange={(event) => setKey(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Value</label>
            <input value={value} onChange={(event) => setValue(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Description</label>
            <input value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white transition hover:bg-indigo-500">Save setting</button>
        </form>

        <form onSubmit={handleTokenSubmit} className="space-y-4 rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-white">Create API token</h3>
            <span className="rounded-full bg-violet-500/15 px-2 py-1 text-xs font-medium text-violet-300">Token</span>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Token name</label>
            <input value={tokenName} onChange={(event) => setTokenName(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Expires in days</label>
            <input type="number" min={1} max={3650} value={expiresDays} onChange={(event) => setExpiresDays(Number(event.target.value) || 30)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20" />
          </div>
          <button type="submit" className="rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:brightness-110">Generate token</button>
          {newToken && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200 break-all shadow-inner shadow-emerald-500/10">
              {newToken}
            </div>
          )}
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
          <h3 className="text-xl font-semibold text-white">Current settings</h3>
          <div className="mt-4 space-y-3">
            {Object.keys(settings).length === 0 ? (
              <p className="text-slate-400">No settings available.</p>
            ) : (
              Object.entries(settings).map(([keyName, valueName]) => (
                <div key={keyName} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-indigo-300">{keyName}</div>
                  <div className="mt-2 break-all text-sm text-slate-100">{valueName}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
          <h3 className="text-xl font-semibold text-white">API tokens</h3>
          <div className="mt-4 space-y-3">
            {apiTokens.length === 0 ? (
              <p className="text-slate-400">No API tokens created yet.</p>
            ) : (
              apiTokens.map((token) => (
                <div key={token.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">{token.name}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${token.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                      {token.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">Prefix: {token.prefix}</div>
                  <div className="text-xs text-slate-400">Created: {new Date(token.created_at).toLocaleDateString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[26px] border border-slate-800 bg-slate-900/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.28)]">
        <h3 className="text-xl font-semibold text-white">Audit log</h3>
        <div className="mt-4 space-y-3">
          {auditLogs.length === 0 ? (
            <p className="text-slate-400">No audit events yet.</p>
          ) : (
            auditLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white">{log.action}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${log.success ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                    {log.success ? 'Success' : 'Failed'}
                  </span>
                </div>
                <div className="mt-2 text-slate-300">{log.resource}</div>
                <div className="mt-1 text-slate-400">{log.details || 'No details provided'}</div>
                <div className="mt-2 text-[11px] text-slate-500">{new Date(log.created_at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

export default App
