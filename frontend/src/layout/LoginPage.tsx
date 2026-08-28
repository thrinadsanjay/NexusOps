import { FormEvent, useState } from 'react'

import { SiteFooter } from './SiteFooter'

type LoginPageProps = {
  onSubmit: (username: string, password: string) => Promise<void> | void
  loading: boolean
  error: string
}

export function LoginPage({ onSubmit, loading, error }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const errorId = 'login-error'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await onSubmit(username, password)
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <a href="#login-form" className="skip-link">
        Skip to sign-in form
      </a>
      <header className="border-b border-slate-800/80 bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400 text-sm font-black text-slate-950" aria-hidden="true">
            N
          </div>
          <div>
            <p className="text-sm font-semibold text-white">NexusOps</p>
            <p className="text-xs text-slate-400">Operations platform</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden bg-slate-950 p-10 lg:block" aria-labelledby="login-intro-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Secure access</p>
            <h1 id="login-intro-heading" className="mt-4 text-3xl font-semibold tracking-tight text-white">
              Welcome back
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
              Sign in to manage networks, inventory, directory accounts, and certificates from one control plane.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-slate-200">
              {['Role-based access for operators and viewers', 'Directory and local account authentication', 'Audit trail for infrastructure changes'].map((item) => (
                <li key={item} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-400" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="p-8 sm:p-10" aria-labelledby="login-heading">
            <h1 id="login-heading" className="text-2xl font-semibold text-white lg:hidden">
              Welcome back
            </h1>
            <h2 className="text-xl font-semibold text-white">Sign in to NexusOps</h2>
            <p className="mt-2 text-sm text-slate-400">Use your local or directory username.</p>

            <form id="login-form" className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-200">
                  Username or email
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-required="true"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    aria-required="true"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 pr-24 text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-2 my-1 rounded-lg px-3 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {error && (
                <p id={errorId} role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </section>
        </div>
      </main>
      <SiteFooter compact />
    </div>
  )
}
