import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { API_BASE_URL } from './apiBase'
import { Sidebar } from './Sidebar'
import { IPAddressesPanel, NetworkOverview, SubnetsPanel, VLansPanel } from './Ipam'
import { GroupsPanel, HostsPanel, TagsPanel } from './Inventory'
import { DnsOverview } from './Dns'
import { DhcpPanel } from './Dhcp'
import { PkiPanel } from './Pki'
import { LdapPanel } from './Ldap'
import { SmtpPanel } from './Smtp'
import { ToolsPanel } from './Tools'
import { SettingsGeneral, SettingsTokens } from './Settings'
import { AuditLogs, SystemLogs } from './Logs'
import { Dashboard } from './Dashboard'
import { Login } from './Login'
import { TopBar } from './TopBar'
import { Badge, PageHeader, cardClass, tableWrapClass } from './ui'

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

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('nexusops_token'))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const savedUser = localStorage.getItem('nexusops_user')
    return savedUser ? JSON.parse(savedUser) : null
  })
  const [users, setUsers] = useState<UserRecord[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

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
    ])
      .then(async ([userResponse, roleResponse]) => {
        if (!userResponse.ok || !roleResponse.ok) {
          throw new Error('Unable to load access data')
        }

        const [userData, roleData] = await Promise.all([
          userResponse.json() as Promise<UserRecord[]>,
          roleResponse.json() as Promise<Role[]>,
        ])

        setUsers(userData)
        setRoles(roleData)
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

  const renderRoutes = () => (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login onSubmit={handleLogin} loading={loading} error={error} />} />
      <Route path="/" element={isAuthenticated ? <Dashboard userName={user!.full_name || user!.username || 'Operator'} /> : <Navigate to="/login" replace />} />
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
      <Route path="/smtp" element={isAuthenticated ? <SmtpPanel /> : <Navigate to="/login" replace />} />
      <Route path="/tools" element={isAuthenticated ? <ToolsPanel /> : <Navigate to="/login" replace />} />
      <Route path="/settings/tokens" element={isAuthenticated ? <SettingsTokens /> : <Navigate to="/login" replace />} />
      <Route path="/settings" element={isAuthenticated ? <SettingsGeneral /> : <Navigate to="/login" replace />} />
      <Route path="/logs/audit" element={isAuthenticated ? <AuditLogs /> : <Navigate to="/login" replace />} />
      <Route path="/logs/system" element={isAuthenticated ? <SystemLogs /> : <Navigate to="/login" replace />} />
      <Route path="/logs" element={<Navigate to="/logs/audit" replace />} />
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
          <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-[#0b1220]">
            <TopBar
              userName={user?.full_name || user?.username || 'Operator'}
              userRole={user?.is_superuser ? 'Local Administrator' : 'Operator'}
              userEmail={user?.email}
              onLogout={handleLogout}
              onOpenMobile={() => setMobileNavOpen(true)}
            />
            <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">{renderRoutes()}</main>
          </div>
        </div>
      ) : (
        <main className="min-h-screen">{renderRoutes()}</main>
      )}
    </div>
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
      <PageHeader title="Users" description="Local accounts with role-based access." actions={<span className="text-sm text-slate-500">{users.length} accounts</span>} />

      <form onSubmit={handleSubmit} className="grid gap-4 rounded-xl border border-white/10 bg-[#151b24] p-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Email</label>
          <input value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Username</label>
          <input value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Full name</label>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Password</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white transition hover:bg-indigo-500">Create user</button>
        </div>
      </form>

      <div className={tableWrapClass}>
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-[#0b1220] text-xs font-medium uppercase tracking-wide text-slate-500">
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
      <PageHeader title="Roles" description="Permission groups configured for the platform." />

      <div className="grid gap-4 md:grid-cols-2">
        {roles.length === 0 ? (
          <div className={`${cardClass} text-sm text-slate-500 md:col-span-2`}>No roles returned yet.</div>
        ) : (
          roles.map((role) => (
            <div key={role.id} className={cardClass}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">{role.name}</h3>
                <Badge tone="info">{role.permissions.length} permissions</Badge>
              </div>
              {role.description && <p className="mt-2 text-sm leading-6 text-slate-400">{role.description}</p>}
              <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
                {role.permissions.length === 0 ? (
                  <li className="rounded-lg border border-white/5 bg-[#0b1220] px-3 py-2 text-slate-500">No permissions assigned</li>
                ) : (
                  role.permissions.map((permission) => (
                    <li key={permission.id} className="rounded-lg border border-white/5 bg-[#0b1220] px-3 py-2">
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

export default App
