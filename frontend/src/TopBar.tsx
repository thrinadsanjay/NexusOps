import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from './apiBase'
import { navSections } from './Sidebar'

type TopBarProps = {
  userName: string
  userRole?: string
  userEmail?: string
  onLogout: () => void
  onOpenMobile: () => void
}

const SEARCH_ITEMS = navSections.flatMap((section) =>
  section.items.flatMap((item) => {
    const self = [{ label: item.label, to: item.to, group: section.title }]
    const children = (item.children || []).map((child) => ({ label: child.label, to: child.to, group: item.label }))
    return [...self, ...children]
  }),
)

export function TopBar({ userName, userRole, userEmail, onLogout, onOpenMobile }: TopBarProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [health, setHealth] = useState<'healthy' | 'degraded' | 'down' | 'checking'>('checking')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (event.key === 'Escape') {
        setOpen(false)
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('nexusops_token')
    if (!token) return
    fetch(`${API_BASE_URL}/api/v1/platform/services`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) return
        const rows = (await response.json()) as { status: string; health: string }[]
        const up = rows.filter((row) => row.status === 'running' && row.health !== 'unhealthy').length
        setHealth(rows.length === 0 ? 'checking' : up === rows.length ? 'healthy' : up === 0 ? 'down' : 'degraded')
      })
      .catch(() => undefined)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SEARCH_ITEMS.slice(0, 8)
    return SEARCH_ITEMS.filter((item) => `${item.label} ${item.group} ${item.to}`.toLowerCase().includes(q)).slice(0, 8)
  }, [query])

  const go = (to: string) => {
    setQuery('')
    setOpen(false)
    navigate(to)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (matches[0]) go(matches[0].to)
  }

  const healthLabel =
    health === 'healthy' ? 'All Systems Operational' : health === 'degraded' ? 'Some Systems Degraded' : health === 'down' ? 'Systems Down' : 'Checking systems'
  const healthDot = health === 'healthy' ? 'bg-emerald-400' : health === 'degraded' ? 'bg-amber-400' : health === 'down' ? 'bg-rose-400' : 'bg-slate-500'

  return (
    <header className="flex h-16 items-center gap-3 border-b border-white/10 bg-[#0d1524] px-4 lg:px-6">
      <button type="button" className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-200 lg:hidden" onClick={onOpenMobile}>
        Menu
      </button>

      <form onSubmit={submit} className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.2-3.2" />
          </svg>
        </div>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="Search hosts, IPs, users, domains..."
          className="w-full rounded-lg border border-white/10 bg-[#0b1220] py-2 pl-10 pr-16 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 hidden items-center sm:flex">
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Ctrl K</kbd>
        </span>
        {open ? (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-[#111827] shadow-xl">
            {matches.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500">No matching pages.</p>
            ) : (
              matches.map((item) => (
                <button
                  key={`${item.group}-${item.to}-${item.label}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => go(item.to)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  <span className="text-slate-100">{item.label}</span>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">{item.group}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </form>

      <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 lg:flex">
        <span className={`h-2 w-2 rounded-full ${healthDot} ${health === 'healthy' ? 'animate-pulse' : ''}`} />
        {healthLabel}
      </div>

      <button
        type="button"
        onClick={() => navigate('/logs/audit')}
        className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5 hover:text-white"
        aria-label="Notifications"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((current) => !current)}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 hover:bg-white/10"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-medium text-white">{userName}</span>
            <span className="block text-[10px] text-slate-500">{userRole || 'Operator'}</span>
          </span>
        </button>
        {menuOpen ? (
          <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-white/10 bg-[#111827] p-2 shadow-xl">
            <div className="px-2 py-2">
              <div className="text-sm font-medium text-white">{userName}</div>
              {userEmail ? <div className="truncate text-xs text-slate-500">{userEmail}</div> : null}
            </div>
            <button type="button" onClick={onLogout} className="mt-1 w-full rounded-md px-2 py-2 text-left text-sm text-slate-200 hover:bg-white/5">
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
