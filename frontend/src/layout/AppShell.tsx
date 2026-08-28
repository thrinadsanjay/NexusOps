import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { CommandPalette } from '../ui/command-palette'
import { UserMenu } from '../ui/user-menu'
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
  const [paletteOpen, setPaletteOpen] = useState(false)
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
        setPaletteOpen(false)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const displayName = user.full_name || user.username
  const roleLabel = user.role_names?.[0] || (user.username === 'admin' ? 'admin' : 'operator')

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="NexusOps home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-black text-accent-fg" aria-hidden="true">
              N
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-ink">NexusOps</span>
              <span className="block text-[11px] text-muted">Control plane</span>
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
                        `rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                          itemIsActive(location.pathname, group.items[0], group.items)
                            ? 'bg-accent-soft text-accent'
                            : 'text-muted hover:bg-elevated hover:text-ink'
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
                      onClose={() => setOpenMenu(null)}
                      onToggle={() => setOpenMenu((current) => (current === group.id ? null : group.id))}
                    />
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="hidden rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-elevated hover:text-ink sm:inline-flex"
              onClick={() => setPaletteOpen(true)}
            >
              Search
              <kbd className="ml-2 rounded border border-line px-1 text-[10px]">⌘K</kbd>
            </button>
            <UserMenu displayName={displayName} roleLabel={roleLabel} onLogout={onLogout} />
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-expanded={mobileOpen}
              aria-controls={menuId}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? 'Close menu' : 'Open menu'}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div id={menuId} className="border-t border-line bg-surface px-4 py-4 lg:hidden" role="dialog" aria-modal="true" aria-label="Main menu">
            <button type="button" className="mb-3 w-full rounded-md border border-line px-3 py-2 text-left text-sm text-muted" onClick={() => { setMobileOpen(false); setPaletteOpen(true) }}>
              Search pages and records…
            </button>
            <MobileNav groups={groups} pathname={location.pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        )}
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter groups={groups} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} canAccess={canAccess} />
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
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const [active, setActive] = useState(0)
  const [buffer, setBuffer] = useState('')
  const bufferTimer = useRef<number | null>(null)
  const menuId = `${group.id}-menu`
  const groupActive = group.items.some((item) => itemIsActive(pathname, item, group.items))

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      const index = Math.max(0, group.items.findIndex((item) => itemIsActive(pathname, item, group.items)))
      setActive(index)
      window.setTimeout(() => itemRefs.current[index]?.focus(), 0)
    }
  }, [open, group.items, pathname])

  const move = useCallback(
    (next: number) => {
      const index = (next + group.items.length) % group.items.length
      setActive(index)
      itemRefs.current[index]?.focus()
    },
    [group.items.length],
  )

  const onTypeahead = (key: string) => {
    if (key.length !== 1 || !key.match(/\S/)) return
    const nextBuffer = `${buffer}${key.toLowerCase()}`
    setBuffer(nextBuffer)
    if (bufferTimer.current) window.clearTimeout(bufferTimer.current)
    bufferTimer.current = window.setTimeout(() => setBuffer(''), 500)
    const index = group.items.findIndex((item) => item.label.toLowerCase().startsWith(nextBuffer))
    if (index >= 0) move(index)
  }

  const onMenuKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(active + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(active - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      move(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      move(group.items.length - 1)
    } else if (event.key === 'Escape') {
      onClose()
    } else {
      onTypeahead(event.key)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          open || groupActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-elevated hover:text-ink'
        }`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            onToggle()
          }
        }}
      >
        {group.label}
        <span aria-hidden="true" className="text-[10px] text-faint">
          ▾
        </span>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={group.label} className="absolute left-0 top-full z-40 min-w-64 rounded-xl border border-line bg-surface p-2 shadow-card" onKeyDown={onMenuKey}>
          {group.items.map((item, index) => {
            const current = itemIsActive(pathname, item, group.items)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                role="menuitem"
                aria-current={current ? 'page' : undefined}
                ref={(node) => {
                  itemRefs.current[index] = node
                }}
                className={`block rounded-lg px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  current || index === active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-elevated'
                }`}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-muted">{item.description}</span>
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
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-elevated'}`}
              >
                {item.to === '/' ? group.label : item.label}
              </NavLink>
            </li>
          )
        }
        const isOpen = expanded === group.id
        return (
          <li key={group.id} className="rounded-lg border border-line">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-ink"
              aria-expanded={isOpen}
              onClick={() => setExpanded((current) => (current === group.id ? null : group.id))}
            >
              {group.label}
              <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <ul className="space-y-1 border-t border-line px-2 py-2">
                {group.items.map((item) => {
                  const active = itemIsActive(pathname, item, group.items)
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        aria-current={active ? 'page' : undefined}
                        onClick={onNavigate}
                        className={`block rounded-md px-3 py-2 ${active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-elevated'}`}
                      >
                        <span className="block text-sm">{item.label}</span>
                        <span className="block text-xs text-muted">{item.description}</span>
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
