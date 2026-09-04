import { FormEvent, useState } from 'react'

const REMEMBER_KEY = 'nexusops_remember_username'

const FEATURES = [
  { title: 'IPAM', detail: 'Subnets, addresses, and scans', icon: 'pin' },
  { title: 'Inventory', detail: 'Hosts, groups, and tags', icon: 'hosts' },
  { title: 'DNS', detail: 'Zones and records', icon: 'globe' },
  { title: 'DHCP', detail: 'Pools, leases, reservations', icon: 'nodes' },
  { title: 'Certificates', detail: 'Let\'s Encrypt and internal CAs', icon: 'shield' },
  { title: 'Directory', detail: 'LDAP users and sync', icon: 'users' },
] as const

function FeatureIcon({ name }: { name: (typeof FEATURES)[number]['icon'] }) {
  const common = 'h-5 w-5 text-indigo-300'
  if (name === 'pin') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.2" />
      </svg>
    )
  }
  if (name === 'hosts') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
        <path d="M7 7h.01M7 17h.01" />
      </svg>
    )
  }
  if (name === 'globe') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4c2.5 2.4 3.8 5.2 3.8 8S14.5 17.6 12 20C9.5 17.6 8.2 14.8 8.2 12S9.5 6.4 12 4z" />
      </svg>
    )
  }
  if (name === 'nodes') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <circle cx="6" cy="6" r="2.2" />
        <circle cx="18" cy="6" r="2.2" />
        <circle cx="12" cy="18" r="2.2" />
        <path d="M8 7.2 11 16M16 7.2 13 16" />
      </svg>
    )
  }
  if (name === 'shield') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <path d="M12 3.5 19 6.2v5.4c0 4.4-2.8 8.2-7 9.4-4.2-1.2-7-5-7-9.4V6.2L12 3.5z" />
        <path d="m9 12 2.1 2.1L15.4 10" />
      </svg>
    )
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="16.5" cy="9" r="2.3" />
      <path d="M4 18.5c.6-3 2.8-4.5 5-4.5s4.4 1.5 5 4.5M14 14.2c1.7-.2 3.4.7 4.2 2.8" />
    </svg>
  )
}

export type LoginProps = {
  onSubmit: (username: string, password: string) => Promise<void> | void
  loading: boolean
  error: string
}

export function Login({ onSubmit, loading, error }: LoginProps) {
  const remembered = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_KEY) ?? '' : ''
  const [username, setUsername] = useState(remembered || 'admin')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(Boolean(remembered))
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (remember && username.trim()) localStorage.setItem(REMEMBER_KEY, username.trim())
    else localStorage.removeItem(REMEMBER_KEY)
    await onSubmit(username, password)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(79,70,229,0.18),transparent_34%),radial-gradient(circle_at_88%_80%,rgba(14,165,233,0.08),transparent_28%)]" />
      <div className="relative grid w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[#111821] shadow-[0_30px_90px_rgba(0,0,0,0.45)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative isolate hidden overflow-hidden bg-[#0b1220] px-8 py-10 md:block lg:px-12 lg:py-12">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(11,18,32,0.2),rgba(11,18,32,0.88))]" />
          <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-48 w-full text-indigo-500/20" viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden>
            <path fill="currentColor" d="M0 160c80-40 140-90 230-90s140 70 230 70 140-80 220-80 90 40 120 60v80H0z" opacity="0.25" />
            <path fill="#0f172a" d="M0 176c90-28 150-64 240-64s130 48 220 48 150-56 230-56 80 28 110 44v52H0z" />
            <g fill="#1e293b">
              <rect x="48" y="118" width="38" height="58" rx="3" />
              <rect x="94" y="102" width="44" height="74" rx="3" />
              <rect x="146" y="126" width="32" height="50" rx="3" />
              <rect x="620" y="108" width="40" height="68" rx="3" />
              <rect x="668" y="124" width="36" height="52" rx="3" />
            </g>
            <g fill="#6366f1" opacity="0.55">
              <circle cx="67" cy="132" r="2" />
              <circle cx="116" cy="118" r="2" />
              <circle cx="640" cy="124" r="2" />
            </g>
          </svg>

          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-lg font-bold text-white shadow-lg shadow-indigo-900/40">
                N
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight text-white">NexusOps</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-indigo-300/80">Infrastructure. Under control.</p>
              </div>
            </div>

            <h1 className="mt-10 max-w-lg text-4xl font-semibold leading-tight tracking-tight text-white">
              Centralized operations for your <span className="text-indigo-300">infrastructure</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
              Manage IPAM, inventory, DNS, DHCP, certificates, and directory services from one secure control plane.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
                      <FeatureIcon name={feature.icon} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{feature.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-400">{feature.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-10 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">One platform. Full control.</p>
          </div>
        </section>

        <section className="relative bg-[#0f1419] px-6 py-8 sm:px-10 sm:py-12">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">Sign in to NexusOps</h2>
                <p className="mt-2 text-sm text-slate-400">Access your infrastructure operations platform.</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white lg:hidden">
                N
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-200">
                  Username or email
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <circle cx="12" cy="8" r="3.2" />
                      <path d="M5 19c.8-3.2 3.4-5 7-5s6.2 1.8 7 5" />
                    </svg>
                  </span>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="admin"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0b1220] py-3 pl-10 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">
                  Password
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <rect x="5" y="10" width="14" height="10" rx="2" />
                      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
                    </svg>
                  </span>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0b1220] py-3 pl-10 pr-11 text-sm text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-2 flex items-center rounded-lg px-2 text-slate-500 transition hover:text-slate-200"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M4 4l16 16" />
                        <path d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9M6.6 6.7C4.5 8.1 3 10.2 2.2 12c1.8 4.1 5.5 7 9.8 7 1.6 0 3.1-.3 4.5-.9M10.6 5.1A10.8 10.8 0 0 1 12 5c4.3 0 8 2.9 9.8 7-.5 1.1-1.1 2.1-1.9 3" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                        <path d="M2.2 12C4 7.9 7.7 5 12 5s8 2.9 9.8 7c-1.8 4.1-5.5 7-9.8 7s-8-2.9-9.8-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-[#0b1220] text-indigo-600 focus:ring-indigo-500/30"
                />
                Remember username
              </label>

              {error && <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign in'}
                {!loading && (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </button>
            </form>

            <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
              <svg className="h-3.5 w-3.5 text-indigo-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 3.5 19 6.2v5.4c0 4.4-2.8 8.2-7 9.4-4.2-1.2-7-5-7-9.4V6.2L12 3.5z" />
              </svg>
              Secure access with role-based permissions and audit logging.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
