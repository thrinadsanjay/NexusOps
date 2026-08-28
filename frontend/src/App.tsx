import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { apiFetch, clearAuth, getToken, readStoredUser, storeAuth } from './api/client'
import { Dashboard } from './Dashboard'
import { IPAddressesPanel, NetworkOverview, SubnetsPanel, VLansPanel } from './Ipam'
import { GroupsPanel, HostsPanel, TagsPanel } from './Inventory'
import { DnsOverview } from './Dns'
import { DhcpPanel } from './Dhcp'
import { PkiPanel } from './Pki'
import { LdapPanel } from './Ldap'
import { ToolsPanel } from './Tools'
import { AppShell } from './layout/AppShell'
import { LoginPage } from './layout/LoginPage'
import { ThemeProvider } from './theme'
import { ConfirmHost } from './ui/confirm-dialog'
import { CopyText } from './ui/copy'
import { EmptyState, PageHeader } from './ui/page'
import { FilterBar, Table, TableFrame, THead, filterInputClass, filterSelectClass } from './ui/table'
import { RelativeTime } from './ui/time'
import { ToastHost, toast } from './ui/toast'

type AuthUser = {
  id: number
  email: string
  username: string
  full_name?: string | null
  is_active: boolean
  is_superuser: boolean
  created_at: string
  permissions?: string[]
  role_names?: string[]
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
  role_names?: string[]
  permissions?: string[]
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

function hasPermission(user: AuthUser | null, permission: string | null): boolean {
  if (!permission) {
    return true
  }
  if (!user) {
    return false
  }
  if (user.is_superuser) {
    return true
  }
  return (user.permissions ?? []).includes(permission)
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastHost />
      <ConfirmHost />
      <AppRoutes />
    </ThemeProvider>
  )
}

function AppRoutes() {
  const [token, setToken] = useState<string | null>(() => getToken() || null)
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser<AuthUser>())
  const [users, setUsers] = useState<UserRecord[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isAuthenticated = Boolean(token && user)

  useEffect(() => {
    if (!token) {
      setUser(null)
      return
    }

    setLoading(true)
    apiFetch('/api/v1/auth/me')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Session expired')
        }
        const data = await response.json()
        setUser(data)
        storeAuth(token, data)
      })
      .catch(() => {
        clearAuth()
        setToken(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!isAuthenticated || !token || !user) {
      return
    }

    const loadIfAllowed = async <T,>(path: string, permission: string, onOk: (payload: T) => void) => {
      if (!hasPermission(user, permission)) {
        return
      }
      const response = await apiFetch(path)
      if (response.ok) {
        onOk((await response.json()) as T)
      }
    }

    void Promise.allSettled([
      loadIfAllowed<UserRecord[]>('/api/v1/users', 'users:read', setUsers),
      loadIfAllowed<Role[]>('/api/v1/roles', 'roles:read', setRoles),
      loadIfAllowed<Permission[]>('/api/v1/permissions', 'roles:read', setPermissions),
      loadIfAllowed<Record<string, string>>('/api/v1/settings', 'settings:read', setSettings),
      loadIfAllowed<AuditLog[]>('/api/v1/audit', 'audit:read', setAuditLogs),
      loadIfAllowed<ApiToken[]>('/api/v1/api-tokens', 'tokens:write', setApiTokens),
    ])
  }, [isAuthenticated, token, user])

  const handleLogin = async (username: string, password: string) => {
    setLoading(true)
    setError('')

    try {
      const response = await apiFetch('/api/v1/auth/login', {
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
      storeAuth(auth.access_token, auth.user)
      setToken(auth.access_token)
      setUser(auth.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined)

    clearAuth()
    setToken(null)
    setUser(null)
    setUsers([])
    setRoles([])
    setPermissions([])
    setSettings({})
    setAuditLogs([])
    setApiTokens([])
  }

  const handleCreateUser = async (payload: { email: string; username: string; full_name: string; password: string }) => {
    if (!token) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await apiFetch('/api/v1/users', {
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
      toast.ok(`Created user ${payload.username}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create user'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSetting = async (key: string, value: string, description?: string) => {
    if (!token) {
      return
    }

    const response = await apiFetch('/api/v1/settings', {
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
    toast.ok(`Saved ${key}`)
  }

  const handleCreateToken = async (name: string, expiresDays: number) => {
    if (!token) {
      return
    }

    const response = await apiFetch('/api/v1/api-tokens', {
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
        id: data.id,
        name: data.name,
        prefix: data.prefix,
        created_at: new Date().toISOString(),
        expires_at: data.expires_at,
        is_active: true,
        token: data.token,
      },
      ...currentTokens,
    ])

    toast.ok('API token created')
    return data.token as string
  }

  const handleRevokeToken = async (tokenId: number) => {
    const response = await apiFetch(`/api/v1/api-tokens/${tokenId}`, { method: 'DELETE' })
    if (!response.ok && response.status !== 204) {
      throw new Error('Unable to revoke token')
    }
    setApiTokens((current) => current.map((item) => (item.id === tokenId ? { ...item, is_active: false } : item)))
    toast.ok('Token revoked')
  }

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    const response = await apiFetch('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.detail ?? 'Unable to change password')
    }
  }

  const handleAssignUserRoles = async (userId: number, roleIds: number[]) => {
    const response = await apiFetch(`/api/v1/users/${userId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ role_ids: roleIds }),
    })
    if (!response.ok) {
      throw new Error('Unable to update user roles')
    }
    const assigned = (await response.json()) as Role[]
    setUsers((current) =>
      current.map((item) => (item.id === userId ? { ...item, role_names: assigned.map((role) => role.name) } : item)),
    )
    toast.ok('Roles updated')
  }

  const handleSaveRolePermissions = async (roleId: number, permissionIds: number[]) => {
    const response = await apiFetch(`/api/v1/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permission_ids: permissionIds }),
    })
    if (!response.ok) {
      throw new Error('Unable to update role permissions')
    }
    const updated = (await response.json()) as Role
    setRoles((current) => current.map((role) => (role.id === roleId ? updated : role)))
    toast.ok('Permissions saved')
  }

  const canWriteRoles = hasPermission(user, 'roles:write')
  const canWriteUsers = hasPermission(user, 'users:write')

  if (!isAuthenticated) {
    return <LoginPage onSubmit={handleLogin} loading={loading} error={error} />
  }

  return (
    <AppShell user={user!} canAccess={(permission) => hasPermission(user, permission)} onLogout={handleLogout}>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<Dashboard user={user!} canAccess={(permission) => hasPermission(user, permission)} />} />
          <Route path="/users" element={hasPermission(user, 'users:read') ? <UsersPanel users={users} roles={roles} canWrite={canWriteUsers} onCreateUser={handleCreateUser} onAssignRoles={handleAssignUserRoles} /> : <Navigate to="/" replace />} />
          <Route path="/roles" element={hasPermission(user, 'roles:read') ? <RolesPanel roles={roles} permissions={permissions} canWrite={canWriteRoles} onSavePermissions={handleSaveRolePermissions} /> : <Navigate to="/" replace />} />
          <Route path="/ipam/vlans" element={hasPermission(user, 'ipam:read') ? <VLansPanel /> : <Navigate to="/" replace />} />
          <Route path="/ipam/subnets" element={hasPermission(user, 'ipam:read') ? <SubnetsPanel /> : <Navigate to="/" replace />} />
          <Route path="/ipam/addresses" element={hasPermission(user, 'ipam:read') ? <IPAddressesPanel /> : <Navigate to="/" replace />} />
          <Route path="/ipam" element={hasPermission(user, 'ipam:read') ? <NetworkOverview /> : <Navigate to="/" replace />} />
          <Route path="/inventory" element={hasPermission(user, 'inventory:read') ? <HostsPanel /> : <Navigate to="/" replace />} />
          <Route path="/inventory/tags" element={hasPermission(user, 'inventory:read') ? <TagsPanel /> : <Navigate to="/" replace />} />
          <Route path="/inventory/groups" element={hasPermission(user, 'inventory:read') ? <GroupsPanel /> : <Navigate to="/" replace />} />
          <Route path="/dns" element={hasPermission(user, 'dns:read') ? <DnsOverview /> : <Navigate to="/" replace />} />
          <Route path="/dhcp" element={hasPermission(user, 'dhcp:read') ? <DhcpPanel /> : <Navigate to="/" replace />} />
          <Route path="/pki" element={hasPermission(user, 'pki:read') ? <PkiPanel /> : <Navigate to="/" replace />} />
          <Route path="/ldap" element={hasPermission(user, 'ldap:read') ? <LdapPanel /> : <Navigate to="/" replace />} />
          <Route path="/tools" element={<ToolsPanel />} />
          <Route
            path="/settings"
            element={
              hasPermission(user, 'settings:read') ? (
                <SettingsPanel
                  settings={settings}
                  auditLogs={auditLogs}
                  apiTokens={apiTokens}
                  onSaveSetting={handleSaveSetting}
                  onCreateToken={handleCreateToken}
                  onRevokeToken={handleRevokeToken}
                  onChangePassword={handleChangePassword}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    </AppShell>
  )
}

function UsersPanel({
  users,
  roles,
  canWrite,
  onCreateUser,
  onAssignRoles,
}: {
  users: UserRecord[]
  roles: Role[]
  canWrite: boolean
  onCreateUser: (payload: { email: string; username: string; full_name: string; password: string }) => Promise<void> | void
  onAssignRoles: (userId: number, roleIds: number[]) => Promise<void>
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
      <PageHeader
        crumbs={[{ label: 'Overview', to: '/' }, { label: 'Identity' }, { label: 'Users', to: '/users' }]}
        title="Users"
        description="Local NexusOps accounts and role assignment."
        actions={<span className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted">{users.length} accounts</span>}
      />

      {canWrite && (
      <form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">Email</label>
          <input value={email} onChange={(event) => setEmail(event.target.value)} className="nx-input" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">Username</label>
          <input value={username} onChange={(event) => setUsername(event.target.value)} className="nx-input" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">Full name</label>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="nx-input" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">Password</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="nx-input" />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" className="nx-btn-primary">Create user</button>
        </div>
      </form>
      )}

      {users.length === 0 ? (
        <EmptyState title="No users yet" body="Create the first local account to share this control plane." />
      ) : (
      <>
      <FilterBar />
      <TableFrame>
        <Table>
          <THead>
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </THead>
          <tbody className="divide-y divide-line bg-surface/70">
            {users.map((userRecord) => (
                <tr key={userRecord.id} className="hover:bg-elevated/70">
                  <td className="px-4 py-4">
                    <div className="font-medium text-ink">{userRecord.full_name || userRecord.username}</div>
                    <div className="text-muted">{userRecord.email}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${userRecord.is_active ? 'bg-ok/15 text-ok' : 'bg-elevated text-muted'}`}>
                      {userRecord.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-muted">
                    <div>{(userRecord.role_names && userRecord.role_names.length > 0) ? userRecord.role_names.join(', ') : (userRecord.is_superuser ? 'Admin' : 'User')}</div>
                    {canWrite && roles.length > 0 && (
                      <select
                        className="mt-2 w-full rounded-xl border border-line bg-canvas px-2 py-1 text-xs text-ink"
                        defaultValue=""
                        onChange={(event) => {
                          const roleId = Number(event.target.value)
                          if (roleId) {
                            void onAssignRoles(userRecord.id, [roleId])
                          }
                        }}
                      >
                        <option value="">Assign role…</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-4 text-muted"><RelativeTime value={userRecord.created_at} /></td>
                </tr>
            ))}
          </tbody>
        </Table>
      </TableFrame>
      </>
      )}
    </section>
  )
}

function RolesPanel({
  roles,
  permissions,
  canWrite,
  onSavePermissions,
}: {
  roles: Role[]
  permissions: Permission[]
  canWrite: boolean
  onSavePermissions: (roleId: number, permissionIds: number[]) => Promise<void>
}) {
  return (
    <section className="space-y-6">
      <PageHeader
        crumbs={[{ label: 'Overview', to: '/' }, { label: 'Identity' }, { label: 'Roles', to: '/roles' }]}
        title="Roles"
        description="Permission groups configured for the platform."
      />

      <div className="grid gap-5 md:grid-cols-2">
        {roles.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-6 text-muted md:col-span-2">No roles returned yet.</div>
        ) : (
          roles.map((role) => (
            <div key={role.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-ink">{role.name}</h3>
                <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">{role.permissions.length} perms</span>
              </div>
              {role.description && <p className="mt-2 text-sm leading-6 text-muted">{role.description}</p>}
              <ul className="mt-4 space-y-2 text-sm text-muted">
                {role.permissions.length === 0 ? (
                  <li className="rounded-xl border border-line bg-canvas/60 px-3 py-2 text-faint">No permissions assigned</li>
                ) : (
                  role.permissions.map((permission) => (
                    <li key={permission.id} className="rounded-xl border border-line bg-canvas/60 px-3 py-2 text-ink">
                      {permission.name}
                    </li>
                  ))
                )}
              </ul>
              {canWrite && permissions.length > 0 && (
                <div className="mt-4 space-y-2">
                  {permissions.map((permission) => {
                    const checked = role.permissions.some((item) => item.id === permission.id)
                    return (
                      <label key={permission.id} className="flex items-center gap-2 rounded-xl border border-line bg-canvas/60 px-3 py-2 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const current = role.permissions.map((item) => item.id)
                            const next = event.target.checked
                              ? [...current, permission.id]
                              : current.filter((id) => id !== permission.id)
                            void onSavePermissions(role.id, next)
                          }}
                        />
                        {permission.name}
                      </label>
                    )
                  })}
                </div>
              )}
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
  onRevokeToken,
  onChangePassword,
}: {
  settings: Record<string, string>
  auditLogs: AuditLog[]
  apiTokens: ApiToken[]
  onSaveSetting: (key: string, value: string, description?: string) => Promise<void>
  onCreateToken: (name: string, expiresDays: number) => Promise<string | undefined>
  onRevokeToken: (tokenId: number) => Promise<void>
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>
}) {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'platform'
  const setTab = (next: string) => {
    const copy = new URLSearchParams(params)
    copy.set('tab', next)
    setParams(copy, { replace: true })
  }

  const [key, setKey] = useState('app_name')
  const [value, setValue] = useState('NexusOps')
  const [description, setDescription] = useState('Platform display name')
  const [tokenName, setTokenName] = useState('')
  const [expiresDays, setExpiresDays] = useState(30)
  const [newToken, setNewToken] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [auditQuery, setAuditQuery] = useState('')
  const [auditSuccess, setAuditSuccess] = useState(params.get('success') ?? '')
  const [auditRange, setAuditRange] = useState('all')

  useEffect(() => {
    const success = params.get('success')
    if (success !== null) {
      setAuditSuccess(success)
    }
  }, [params])

  const handleSettingSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!key || !value) return
    await onSaveSetting(key, value, description)
    setKey('')
    setValue('')
    setDescription('')
  }

  const handleTokenSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!tokenName) return
    const token = await onCreateToken(tokenName, expiresDays)
    setNewToken(token ?? '')
    setTokenName('')
    setExpiresDays(30)
  }

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordMessage('')
    try {
      await onChangePassword(currentPassword, newPassword)
      setPasswordMessage('Password updated')
      toast.ok('Password updated')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to change password'
      setPasswordMessage(message)
      toast.error(message)
    }
  }

  const filteredAudit = auditLogs.filter((log) => {
    const q = auditQuery.toLowerCase()
    const matchText = !q || `${log.action} ${log.resource} ${log.details ?? ''} ${log.user_id ?? ''}`.toLowerCase().includes(q)
    const matchSuccess = auditSuccess === '' || String(log.success) === auditSuccess
    const created = new Date(log.created_at).getTime()
    const now = Date.now()
    const matchRange =
      auditRange === 'all' ||
      (auditRange === 'today' && now - created < 86400000) ||
      (auditRange === '7d' && now - created < 7 * 86400000) ||
      (auditRange === '30d' && now - created < 30 * 86400000)
    return matchText && matchSuccess && matchRange
  })

  const tabs = [
    { id: 'platform', label: 'Platform' },
    { id: 'tokens', label: 'API tokens' },
    { id: 'password', label: 'Password' },
    { id: 'audit', label: 'Audit' },
  ]

  return (
    <section className="space-y-6">
      <PageHeader
        crumbs={[{ label: 'Overview', to: '/' }, { label: 'Operations' }, { label: 'Settings', to: '/settings' }]}
        title="Settings & access"
        description="Platform defaults, API tokens, password, and the full audit log."
      />

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${tab === item.id ? 'bg-accent text-accent-fg' : 'bg-elevated text-muted'}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'platform' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={handleSettingSubmit} className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h3 className="text-lg font-semibold text-ink">Update setting</h3>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Key</label>
              <input value={key} onChange={(event) => setKey(event.target.value)} className="nx-input" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Value</label>
              <input value={value} onChange={(event) => setValue(event.target.value)} className="nx-input" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Description</label>
              <input value={description} onChange={(event) => setDescription(event.target.value)} className="nx-input" />
            </div>
            <button type="submit" className="nx-btn-primary">Save setting</button>
          </form>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h3 className="text-lg font-semibold text-ink">Current settings</h3>
            <div className="mt-4 space-y-3">
              {Object.keys(settings).length === 0 ? (
                <p className="text-muted">No settings available.</p>
              ) : (
                Object.entries(settings).map(([keyName, valueName]) => (
                  <div key={keyName} className="rounded-2xl border border-line bg-canvas/60 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-accent">{keyName}</div>
                    <div className="mt-2 break-all text-sm text-ink">{valueName}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'tokens' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={handleTokenSubmit} className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h3 className="text-lg font-semibold text-ink">Create API token</h3>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Token name</label>
              <input value={tokenName} onChange={(event) => setTokenName(event.target.value)} className="nx-input" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Expires in days</label>
              <input type="number" min={1} max={3650} value={expiresDays} onChange={(event) => setExpiresDays(Number(event.target.value) || 30)} className="nx-input" />
            </div>
            <button type="submit" className="nx-btn-primary">Generate token</button>
            {newToken && (
              <div className="rounded-2xl border border-ok/30 bg-ok/10 p-3 text-sm text-ok">
                <CopyText value={newToken} label="API token" />
              </div>
            )}
          </form>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h3 className="text-lg font-semibold text-ink">API tokens</h3>
            <div className="mt-4 space-y-3">
              {apiTokens.length === 0 ? (
                <EmptyState title="No API tokens" body="Generate a token for automation and keep the secret in a vault." />
              ) : (
                apiTokens.map((token) => (
                  <div key={token.id} className="rounded-2xl border border-line bg-canvas/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink">{token.name}</span>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${token.is_active ? 'bg-ok/15 text-ok' : 'bg-elevated text-muted'}`}>
                        {token.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted">
                      Prefix: <CopyText value={token.prefix} label="token prefix" />
                    </div>
                    <RelativeTime value={token.created_at} className="text-xs text-muted" />
                    {token.is_active && (
                      <button type="button" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger" onClick={() => void onRevokeToken(token.id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="max-w-xl space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h3 className="text-lg font-semibold text-ink">Change password</h3>
          <div>
            <label htmlFor="current-password" className="mb-2 block text-sm font-medium text-ink">Current password</label>
            <input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="nx-input" />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-ink">New password</label>
            <input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="nx-input" />
          </div>
          <button type="submit" className="nx-btn-primary">Update password</button>
          {passwordMessage && <p className="text-sm text-muted">{passwordMessage}</p>}
        </form>
      )}

      {tab === 'audit' && (
        <div className="space-y-4">
          <FilterBar>
            <input value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="Filter action, resource, user id…" className={filterInputClass()} />
            <select value={auditSuccess} onChange={(event) => setAuditSuccess(event.target.value)} className={filterSelectClass()}>
              <option value="">All results</option>
              <option value="true">Success</option>
              <option value="false">Failed</option>
            </select>
            <select value={auditRange} onChange={(event) => setAuditRange(event.target.value)} className={filterSelectClass()}>
              <option value="all">Any time</option>
              <option value="today">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </FilterBar>
          {filteredAudit.length === 0 ? (
            <EmptyState title="No matching audit events" body="Try a wider time range or clear the success filter." />
          ) : (
            <TableFrame>
              <Table>
                <THead>
                  <tr>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Resource</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                    <th className="px-4 py-3 font-medium">When</th>
                  </tr>
                </THead>
                <tbody className="divide-y divide-line">
                  {filteredAudit.map((log) => (
                    <tr key={log.id} className="hover:bg-elevated/70">
                      <td className="px-4 py-3 font-medium text-ink">{log.action}</td>
                      <td className="px-4 py-3 text-muted">
                        <div>{log.resource}</div>
                        <div className="text-xs text-faint">{log.details || 'No details'}{log.user_id ? ` · user ${log.user_id}` : ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${log.success ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger'}`}>
                          {log.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted"><RelativeTime value={log.created_at} /></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableFrame>
          )}
        </div>
      )}
    </section>
  )
}
