import { FormEvent, useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from './apiBase'
import { formatApiDetail } from './ipamDiscover'
import { Alert, PageHeader, btnDanger, btnPrimary, btnSecondary, cardClass, fieldClass, labelClass, tableWrapClass } from './ui'

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('nexusops_token') ?? ''}`, 'Content-Type': 'application/json' }
}

export type SmtpRelay = {
  id: number
  name: string
  provider: string
  host: string
  port: number
  encryption: string
  username: string | null
  has_password: boolean
  from_address: string
  allowed_networks: string
  is_default: boolean
  enabled: boolean
  last_test_at: string | null
  last_test_status: string | null
  last_test_error: string | null
  notes: string | null
}

export type SmtpMessage = {
  id: number
  relay_id: number | null
  direction: string
  sender: string
  recipients: string
  subject: string | null
  status: string
  error_message: string | null
  created_at: string
}

export type SmtpStatus = {
  listening: boolean
  listen_host: string
  listen_port: number
  published_port: number | null
  default_relay: string | null
  default_smart_host: string | null
}

const input = fieldClass
const lbl = labelClass
const card = cardClass

function applyPreset(provider: string) {
  if (provider === 'google') return { host: 'smtp.gmail.com', port: '587', encryption: 'starttls' }
  if (provider === 'microsoft') return { host: 'smtp.office365.com', port: '587', encryption: 'starttls' }
  return { host: '', port: '587', encryption: 'starttls' }
}

export function SmtpPanel() {
  const [relays, setRelays] = useState<SmtpRelay[]>([])
  const [messages, setMessages] = useState<SmtpMessage[]>([])
  const [status, setStatus] = useState<SmtpStatus | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const [name, setName] = useState('Gmail')
  const [provider, setProvider] = useState('google')
  const [host, setHost] = useState('smtp.gmail.com')
  const [port, setPort] = useState('587')
  const [encryption, setEncryption] = useState('starttls')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [networks, setNetworks] = useState('10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32')
  const [isDefault, setIsDefault] = useState(true)
  const [testTo, setTestTo] = useState('')

  const load = useCallback(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/v1/smtp/relays`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/smtp/messages`, { headers: authHeaders() }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/v1/smtp/status`, { headers: authHeaders() }).then((r) => r.json()),
    ]).then(([r, m, s]) => {
      setRelays(Array.isArray(r) ? r : [])
      setMessages(Array.isArray(m) ? m : [])
      setStatus(s && !s.detail ? s : null)
    }).catch(() => undefined)
  }, [])

  useEffect(() => { load() }, [load])

  const onProvider = (value: string) => {
    setProvider(value)
    const preset = applyPreset(value)
    setHost(preset.host)
    setPort(preset.port)
    setEncryption(preset.encryption)
    if (value === 'google' && !name) setName('Gmail')
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setNotice('')
    const r = await fetch(`${API_BASE_URL}/api/v1/smtp/relays`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        name,
        provider,
        host,
        port: Number(port) || 587,
        encryption,
        username: username || null,
        password: password || null,
        from_address: fromAddress,
        allowed_networks: networks,
        is_default: isDefault,
      }),
    })
    const data = await r.json()
    if (!r.ok) { setErr(formatApiDetail(data.detail) || 'Failed to add relay'); return }
    setShowForm(false); setPassword(''); load()
    setNotice('Relay saved. Send a test message, then point LAN devices at this host on port 25.')
  }

  const sendTest = async (id: number) => {
    if (!testTo.trim()) { setErr('Enter a recipient for the test message'); return }
    setBusyId(id); setErr(''); setNotice('')
    const r = await fetch(`${API_BASE_URL}/api/v1/smtp/relays/${id}/test`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ to: testTo, subject: 'NexusOps SMTP test', body: 'NexusOps reached this mailbox through the configured relay.' }),
    })
    const data = await r.json().catch(() => ({}))
    setBusyId(null)
    if (!r.ok) { setErr(formatApiDetail(data.detail) || 'Send failed'); load(); return }
    setNotice(`Sent test message to ${testTo}`)
    load()
  }

  const remove = async (id: number) => {
    const r = await fetch(`${API_BASE_URL}/api/v1/smtp/relays/${id}`, { method: 'DELETE', headers: authHeaders() })
    if (r.ok || r.status === 204) load()
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Mail"
        description="Accept SMTP from the LAN and relay it through Gmail, Google Workspace, Microsoft 365, or any smart host."
        actions={<button type="button" onClick={() => setShowForm((p) => !p)} className={btnPrimary}>{showForm ? 'Cancel' : '+ Relay'}</button>}
      />

      {status && (
        <div className={`${card} grid gap-3 md:grid-cols-3`}>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">LAN SMTP</div>
            <div className="mt-1 text-sm text-white">{status.listening ? `Listening on :${status.listen_port} (publish ${status.published_port ?? 25})` : 'Listener is off until the backend starts with SMTP_LISTEN_ENABLE=true'}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Smart host</div>
            <div className="mt-1 text-sm text-white">{status.default_smart_host || 'No default relay yet'}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Default relay</div>
            <div className="mt-1 text-sm text-white">{status.default_relay || '—'}</div>
          </div>
        </div>
      )}

      {notice && <Alert tone="success">{notice}</Alert>}
      {err && <Alert>{err}</Alert>}

      {showForm && (
        <form onSubmit={handleCreate} className={`${card} grid gap-3 md:grid-cols-2 xl:grid-cols-3`}>
          <div>
            <label className={lbl}>Provider</label>
            <select value={provider} onChange={(e) => onProvider(e.target.value)} className={input}>
              <option value="google">Google / Gmail</option>
              <option value="microsoft">Microsoft 365</option>
              <option value="custom">Custom SMTP</option>
            </select>
          </div>
          <div><label className={lbl}>Name</label><input value={name} onChange={(e) => setName(e.target.value)} required className={input} /></div>
          <div><label className={lbl}>Host</label><input value={host} onChange={(e) => setHost(e.target.value)} required placeholder="smtp.gmail.com" className={input} /></div>
          <div><label className={lbl}>Port</label><input value={port} onChange={(e) => setPort(e.target.value)} className={input} /></div>
          <div>
            <label className={lbl}>Encryption</label>
            <select value={encryption} onChange={(e) => setEncryption(e.target.value)} className={input}>
              <option value="starttls">STARTTLS (587)</option>
              <option value="ssl">SSL/TLS (465)</option>
              <option value="none">None</option>
            </select>
          </div>
          <div><label className={lbl}>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="you@gmail.com" className={input} /></div>
          <div><label className={lbl}>Password / app password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Gmail App Password" className={input} /></div>
          <div><label className={lbl}>From address</label><input type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} required placeholder="you@gmail.com" className={input} /></div>
          <div className="md:col-span-2"><label className={lbl}>LAN networks allowed to relay</label><input value={networks} onChange={(e) => setNetworks(e.target.value)} className={input} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4" />
            Default relay for the LAN SMTP server
          </label>
          {provider === 'google' && (
            <p className="md:col-span-2 xl:col-span-3 text-xs leading-5 text-slate-400">
              Google needs an <a className="text-indigo-300 underline" href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noreferrer">App Password</a> (2-Step Verification on). Host is smtp.gmail.com, port 587, STARTTLS. The From address must be that Google account.
            </p>
          )}
          <div className="md:col-span-2 xl:col-span-3 flex justify-end">
            <button type="submit" className={btnPrimary}>Save relay</button>
          </div>
        </form>
      )}

      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <div className="min-w-[220px] flex-1">
          <label className={lbl}>Test recipient</label>
          <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@sanjay-lab.online" className={input} />
        </div>
        <p className="text-xs text-slate-400">Use Send test on a relay after saving. Point printers and apps at this NexusOps host, TCP port 25.</p>
      </div>

      <div className={tableWrapClass}>
        <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
          <thead className="bg-[#0b1220] text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Relay</th>
              <th className="px-4 py-3">Smart host</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/60">
            {relays.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No relays yet. Add Gmail or another smart host.</td></tr>
            ) : relays.map((relay) => (
              <tr key={relay.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="font-semibold text-white">{relay.name}</div>
                  <div className="text-[11px] text-slate-400">{relay.provider}{relay.is_default ? ' · default' : ''}{relay.enabled ? '' : ' · disabled'}</div>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-slate-300">{relay.host}:{relay.port} ({relay.encryption})</td>
                <td className="px-4 py-3 text-slate-200">{relay.from_address}</td>
                <td className="px-4 py-3">
                  {relay.last_test_status === 'ok' && <span className="text-emerald-300">ok</span>}
                  {relay.last_test_status === 'error' && <span className="text-rose-300">{relay.last_test_error || 'error'}</span>}
                  {!relay.last_test_status && <span className="text-slate-500">untested</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" disabled={busyId === relay.id} onClick={() => void sendTest(relay.id)} className={btnSecondary}>{busyId === relay.id ? 'Sending…' : 'Send test'}</button>
                    <button type="button" onClick={() => void remove(relay.id)} className={btnDanger}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-white">Recent messages</h3>
        <div className={tableWrapClass}>
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-[#0b1220] text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Dir</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/60">
              {messages.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No messages yet.</td></tr>
              ) : messages.map((msg) => (
                <tr key={msg.id}>
                  <td className="px-4 py-3 text-slate-400">{new Date(msg.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-300">{msg.direction}</td>
                  <td className="px-4 py-3 text-slate-200">{msg.recipients}</td>
                  <td className="px-4 py-3 text-slate-300">{msg.subject ?? '—'}</td>
                  <td className="px-4 py-3">
                    {msg.status === 'sent' ? <span className="text-emerald-300">sent</span> : <span className="text-rose-300">{msg.error_message || msg.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
