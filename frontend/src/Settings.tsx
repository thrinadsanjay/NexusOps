import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from './apiBase'
import { Alert, Badge, PageHeader, btnDanger, btnPrimary, cardClass, fieldClass, labelClass } from './ui'

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('nexusops_token') ?? ''}`, 'Content-Type': 'application/json' }
}

type GeneralSettings = {
  app_name: string
  app_description: string
  theme: string
  environment: string
}

type ApiToken = {
  id: number
  name: string
  prefix: string
  created_at: string
  expires_at?: string | null
  last_used_at?: string | null
  is_active: boolean
}

type Credential = {
  id: string
  name: string
  provider: string
  category: string
  status: string
  summary: string
  href: string
  configured: boolean
  planned: boolean
}

const SETTING_FIELDS = [
  { key: 'app_name', label: 'Application name', hint: 'Shown in the header and browser title.' },
  { key: 'app_description', label: 'Description', hint: 'Short line for the overview and login.' },
] as const

function statusTone(status: string): 'success' | 'warning' | 'neutral' | 'info' {
  if (status === 'configured') return 'success'
  if (status === 'missing') return 'warning'
  if (status === 'planned') return 'info'
  return 'neutral'
}

function statusLabel(status: string): string {
  if (status === 'configured') return 'Configured'
  if (status === 'missing') return 'Not set'
  if (status === 'planned') return 'Coming later'
  return status
}

export function SettingsGeneral() {
  const [form, setForm] = useState<GeneralSettings>({
    app_name: 'NexusOps',
    app_description: 'Infrastructure Operations Platform',
    theme: 'dark',
    environment: '',
  })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetch(`${API_BASE_URL}/api/v1/settings/general`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: GeneralSettings) => setForm(data))
      .catch(() => setError('Unable to load settings'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const r = await fetch(`${API_BASE_URL}/api/v1/settings/general`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        app_name: form.app_name,
        app_description: form.app_description,
        theme: form.theme,
      }),
    })
    const data = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setError(typeof data.detail === 'string' ? data.detail : 'Unable to save settings')
      return
    }
    setForm(data)
    setNotice('Settings saved.')
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="General"
        description="Instance name, description, and appearance. Tokens and logs live on their own pages."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className={cardClass}>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Environment</div>
          <div className="mt-2 text-lg font-semibold capitalize text-white">{form.environment || '—'}</div>
        </div>
        <div className={cardClass}>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Theme</div>
          <div className="mt-2 text-lg font-semibold capitalize text-white">{form.theme}</div>
        </div>
        <div className={cardClass}>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Related</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/settings/tokens" className="text-sm text-indigo-300 hover:text-indigo-200">
              Tokens
            </Link>
            <span className="text-slate-600">·</span>
            <Link to="/logs/audit" className="text-sm text-indigo-300 hover:text-indigo-200">
              Audit logs
            </Link>
            <span className="text-slate-600">·</span>
            <Link to="/logs/system" className="text-sm text-indigo-300 hover:text-indigo-200">
              App logs
            </Link>
          </div>
        </div>
      </div>

      <form onSubmit={save} className={`${cardClass} grid max-w-3xl gap-5`}>
        {SETTING_FIELDS.map((field) => (
          <div key={field.key}>
            <label className={labelClass}>{field.label}</label>
            <input
              value={form[field.key]}
              onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
              className={fieldClass}
            />
            <p className="mt-1.5 text-xs text-slate-500">{field.hint}</p>
          </div>
        ))}
        <div>
          <label className={labelClass}>Theme</label>
          <select
            value={form.theme}
            onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value }))}
            className={fieldClass}
          >
            <option value="dark">Dark</option>
            <option value="light">Light (stored; UI stays dark until a light theme ships)</option>
          </select>
        </div>
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        <div>
          <button type="submit" disabled={busy} className={btnPrimary}>
            Save settings
          </button>
        </div>
      </form>
    </section>
  )
}

export function SettingsTokens() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [name, setName] = useState('')
  const [expiresDays, setExpiresDays] = useState(30)
  const [newToken, setNewToken] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/api-tokens`, { headers: authHeaders() }),
      fetch(`${API_BASE_URL}/api/v1/settings/credentials`, { headers: authHeaders() }),
    ])
      .then(async ([tokenRes, credRes]) => {
        if (tokenRes.ok) setTokens(await tokenRes.json())
        if (credRes.ok) setCredentials(await credRes.json())
      })
      .catch(() => setError('Unable to load tokens'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const createToken = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setError('')
    setNotice('')
    setBusy(true)
    const r = await fetch(`${API_BASE_URL}/api/v1/api-tokens`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: name.trim(), expires_days: expiresDays }),
    })
    const data = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) {
      setError(typeof data.detail === 'string' ? data.detail : 'Unable to create token')
      return
    }
    setNewToken(data.token || '')
    setName('')
    setNotice('Copy this token now. It is not shown again.')
    load()
  }

  const revoke = async (id: number) => {
    setError('')
    const r = await fetch(`${API_BASE_URL}/api/v1/api-tokens/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (!r.ok && r.status !== 204) {
      setError('Unable to revoke token')
      return
    }
    setNotice('Token revoked.')
    load()
  }

  const current = credentials.filter((item) => !item.planned)
  const planned = credentials.filter((item) => item.planned)

  return (
    <section className="space-y-6">
      <PageHeader
        title="Tokens"
        description="NexusOps API tokens and integration credentials. Secrets stay on the server and are never listed after save."
      />

      <form onSubmit={createToken} className={`${cardClass} grid gap-4 md:grid-cols-[1fr_160px_auto]`}>
        <div className="md:col-span-3 text-sm text-slate-300">
          Personal API tokens authenticate scripts against this NexusOps instance. Prefix is always <span className="font-mono text-white">nxo_</span>.
        </div>
        <div>
          <label className={labelClass}>Token name</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="ci-deploy" className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>Expires (days)</label>
          <input type="number" min={1} max={3650} value={expiresDays} onChange={(event) => setExpiresDays(Number(event.target.value) || 30)} className={fieldClass} />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={busy} className={btnPrimary}>
            Generate
          </button>
        </div>
        {error ? <div className="md:col-span-3"><Alert>{error}</Alert></div> : null}
        {notice ? <div className="md:col-span-3"><Alert tone="success">{notice}</Alert></div> : null}
        {newToken ? (
          <div className="md:col-span-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 font-mono text-sm text-emerald-100 break-all">
            {newToken}
          </div>
        ) : null}
      </form>

      <div className={cardClass}>
        <h3 className="text-base font-semibold text-white">NexusOps API tokens</h3>
        <div className="mt-4 space-y-3">
          {tokens.length === 0 ? (
            <p className="text-sm text-slate-500">No API tokens created yet.</p>
          ) : (
            tokens.map((token) => (
              <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-[#0b1220] p-3">
                <div>
                  <div className="font-medium text-white">{token.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Prefix {token.prefix} · created {new Date(token.created_at).toLocaleDateString()}
                    {token.expires_at ? ` · expires ${new Date(token.expires_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={token.is_active ? 'success' : 'neutral'}>{token.is_active ? 'Active' : 'Revoked'}</Badge>
                  {token.is_active ? (
                    <button type="button" onClick={() => void revoke(token.id)} className={btnDanger}>
                      Revoke
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold text-white">Configured integrations</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {current.map((item) => (
            <Link key={item.id} to={item.href} className={`${cardClass} block transition hover:border-indigo-500/30`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{item.name}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{item.category}</div>
                </div>
                <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
              </div>
              <p className="mt-3 text-sm text-slate-400">{item.summary}</p>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold text-white">Coming later</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {planned.map((item) => (
            <div key={item.id} className={`${cardClass} opacity-80`}>
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-white">{item.name}</div>
                <Badge tone="info">Coming later</Badge>
              </div>
              <p className="mt-3 text-sm text-slate-500">{item.summary}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
