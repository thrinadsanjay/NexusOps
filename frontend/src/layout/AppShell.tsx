import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { SiteFooter } from './SiteFooter'
import { NAV_GROUPS, isPathActive, type NavGroup, type NavLinkItem } from './navigation'

type AuthUser = {
  email: string
  username: string
  full_name?: string | null
  role_names?: string[]
}

type AppShellProps = {
  user: AuthUser
  canAccess: (permission: string | null) => boolean
  onLogout: () => void
  children: ReactNode
}

function initialsFor(user: AuthUser): string {
  const source = user.full_name || user.username || user.email
  const parts = source.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

function visibleGroups(groups: NavGroup[], canAccess: (permission: string | null) => boolean): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccess(item.permission)) }))
    .filter((group) => group.items.length > 0)
}

function itemIsActive(pathname: string, item: NavLinkItem, siblings: NavLinkItem[]): boolean {
  if (item.to === '/') {
    return pathname === '/'
  }
  if (!isPathActive(pathname, item.to)) {
    return false
  }
  const moreSpecific = siblings.some((other) => other.to !== item.to && other.to.startsWith(`${item.to}/`) && isPathActive(pathname, other.to))
  return !moreSpecific
}

export function AppShell({ user, canAccess, onLogout, children }: AppShellProps) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const groups = useMemo(() => visibleGroups(NAV_GROUPS, canAccess), [canAccess])
  const menuId = useId()

  useEffect(() => {
    setMobileOpen(false)
    setOpenMenu(null)
  }, [location.pathname])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const displayName = user.full_name || user.username
  const roleLabel = user.role_names?.[0] || (user.username === 'admin' ? 'admin' : 'operator')

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400" aria-label="NexusOps home">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-400 text-sm font-black text-slate-950" aria-hidden="true">
              N
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-white">NexusOps</span>
              <span className="block text-[11px] text-slate-400">Control plane</span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 lg:block" aria-label="Primary">
            <ul className="flex items-center gap-1">
              {groups.map((group) => (
                <li key={group.id}>
                  {group.items.length === 1 ? (
                    <NavLink
                      to={group.items[0].to}
                      aria-current={itemIsActive(location.pathname, group.items[0], group.items) ? 'page' : undefined}
                      className={() =>
                        `rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                          itemIsActive(location.pathname, group.items[0], group.items) ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                        }`
                      }
                    >
                      {group.items[0].to === '/' ? group.label : group.items[0].label}
                    </NavLink>
                  ) : (
                    <DesktopMenu
                      group={group}
                      pathname={location.pathname}
                      open={openMenu === group.id}
                      onClose={() => setOpenMenu((current) => (current === group.id ? null : current))}
                      onToggle={() => setOpenMenu((current) => (current === group.id ? null : group.id))}
                    />
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <p className="hidden text-right text-xs leading-4 text-slate-400 sm:block">
              <span className="block font-medium text-slate-200">{displayName}</span>
              <span className="capitalize">{roleLabel}</span>
            </p>
            <span className="hidden h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200 sm:inline-flex" aria-hidden="true">
              {initialsFor(user)}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              Sign out
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              aria-expanded={mobileOpen}
              aria-controls={menuId}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? 'Close menu' : 'Open menu'}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div id={menuId} className="border-t border-slate-800 bg-slate-950 px-4 py-4 lg:hidden" role="dialog" aria-modal="true" aria-label="Main menu">
            <MobileNav groups={groups} pathname={location.pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        )}
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter groups={groups} />
    </div>
  )
}

function DesktopMenu({
  group,
  pathname,
  open,
  onClose,
  onToggle,
}: {
  group: NavGroup
  pathname: string
  open: boolean
  onClose: () => void
  onToggle: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const menuId = `${group.id}-menu`
  const groupActive = group.items.some((item) => itemIsActive(pathname, item, group.items))

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open, onClose])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
          open || groupActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
        }`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        onClick={onToggle}
      >
        {group.label}
        <span aria-hidden="true" className="text-[10px] text-slate-400">
          ▾
        </span>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={group.label} className="absolute left-0 top-full z-40 min-w-64 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-xl">
          {group.items.map((item) => {
            const active = itemIsActive(pathname, item, group.items)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                role="menuitem"
                aria-current={active ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${active ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800/80'}`}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-slate-400">{item.description}</span>
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MobileNav({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[]
  pathname: string
  onNavigate: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(groups.find((group) => group.items.some((item) => isPathActive(pathname, item.to)))?.id ?? null)

  return (
    <ul className="space-y-2">
      {groups.map((group) => {
        if (group.items.length === 1) {
          const item = group.items[0]
          const active = itemIsActive(pathname, item, group.items)
          return (
            <li key={group.id}>
              <NavLink
                to={item.to}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800'}`}
              >
                {item.to === '/' ? group.label : item.label}
              </NavLink>
            </li>
          )
        }
        const isOpen = expanded === group.id
        return (
          <li key={group.id} className="rounded-lg border border-slate-800">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-white"
              aria-expanded={isOpen}
              onClick={() => setExpanded((current) => (current === group.id ? null : group.id))}
            >
              {group.label}
              <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <ul className="space-y-1 border-t border-slate-800 px-2 py-2">
                {group.items.map((item) => {
                  const active = itemIsActive(pathname, item, group.items)
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        aria-current={active ? 'page' : undefined}
                        onClick={onNavigate}
                        className={`block rounded-md px-3 py-2 ${active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                      >
                        <span className="block text-sm">{item.label}</span>
                        <span className="block text-xs text-slate-400">{item.description}</span>
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
