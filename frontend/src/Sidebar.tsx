import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

export type NavChild = { label: string; to: string }
export type NavItem = { label: string; to: string; children?: NavChild[] }
export type NavSection = { title: string; items: NavItem[] }

export const navSections: NavSection[] = [
  {
    title: 'Operations',
    items: [{ label: 'Overview', to: '/' }],
  },
  {
    title: 'Infrastructure',
    items: [
      {
        label: 'Network',
        to: '/ipam',
        children: [
          { label: 'Overview', to: '/ipam' },
          { label: 'VLANs', to: '/ipam/vlans' },
          { label: 'Subnets', to: '/ipam/subnets' },
          { label: 'Addresses', to: '/ipam/addresses' },
        ],
      },
      {
        label: 'Inventory',
        to: '/inventory',
        children: [
          { label: 'Hosts', to: '/inventory' },
          { label: 'Groups', to: '/inventory/groups' },
          { label: 'Tags', to: '/inventory/tags' },
        ],
      },
      { label: 'DNS', to: '/dns' },
      { label: 'DHCP', to: '/dhcp' },
      { label: 'Mail', to: '/smtp' },
    ],
  },
  {
    title: 'Identity & security',
    items: [
      { label: 'Directory', to: '/ldap' },
      { label: 'Certificates', to: '/pki' },
      { label: 'Users', to: '/users' },
      { label: 'Roles', to: '/roles' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Integrations', to: '/tools' },
      {
        label: 'Settings',
        to: '/settings',
        children: [
          { label: 'General', to: '/settings' },
          { label: 'Tokens', to: '/settings/tokens' },
        ],
      },
      {
        label: 'Logs',
        to: '/logs/audit',
        children: [
          { label: 'Audit', to: '/logs/audit' },
          { label: 'Application', to: '/logs/system' },
        ],
      },
    ],
  },
]

function pathMatches(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

function itemIsActive(pathname: string, item: NavItem): boolean {
  if (item.children?.length) {
    return item.children.some((child) => pathMatches(pathname, child.to))
  }
  return pathMatches(pathname, item.to)
}

export function currentPageLabel(pathname: string): string {
  for (const section of navSections) {
    for (const item of section.items) {
      if (item.children?.length) {
        const child = [...item.children].reverse().find((entry) => pathMatches(pathname, entry.to))
        if (child) return child.label
      } else if (pathMatches(pathname, item.to)) {
        return item.label
      }
    }
  }
  return 'Operations'
}

const linkClass = (active: boolean, compact = false) =>
  `flex min-w-0 flex-1 rounded-md px-3 ${compact ? 'py-1.5 text-[13px]' : 'py-2 text-sm'} transition ${
    active ? 'bg-indigo-500/15 font-medium text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
  }`

type SidebarProps = {
  userName: string
  userRole?: string
  onLogout: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({ userName, userRole, onLogout, mobileOpen, onCloseMobile }: SidebarProps) {
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    onCloseMobile()
  }, [pathname, onCloseMobile])

  const toggle = (key: string) => {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden"
          onClick={onCloseMobile}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-[#0b1220] text-slate-300 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-xs font-semibold text-white">
              N
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight text-white">NexusOps</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Operations</div>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
            onClick={onCloseMobile}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
          {navSections.map((section) => (
            <div key={section.title} className="mb-5">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = itemIsActive(pathname, item)
                  const hasChildren = Boolean(item.children?.length)
                  const open = hasChildren && collapsed[item.to] !== true
                  return (
                    <li key={item.to}>
                      {hasChildren ? (
                        <div className="flex items-center gap-0.5">
                          <NavLink to={item.to} onClick={onCloseMobile} className={linkClass(active)}>
                            {item.label}
                          </NavLink>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={`${open ? 'Collapse' : 'Expand'} ${item.label}`}
                            onClick={() => toggle(item.to)}
                            className="rounded-md px-2 py-2 text-[10px] text-slate-500 hover:bg-white/5 hover:text-white"
                          >
                            {open ? '▾' : '▸'}
                          </button>
                        </div>
                      ) : (
                        <NavLink
                          to={item.to}
                          end={item.to === '/'}
                          onClick={onCloseMobile}
                          className={({ isActive }) => linkClass(isActive)}
                        >
                          {item.label}
                        </NavLink>
                      )}
                      {hasChildren && open ? (
                        <ul className="mb-1 ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                          {item.children!.map((child) => (
                            <li key={`${item.to}-${child.label}`}>
                              <NavLink
                                to={child.to}
                                end
                                onClick={onCloseMobile}
                                className={({ isActive }) => linkClass(isActive, true)}
                              >
                                {child.label}
                              </NavLink>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 truncate text-sm">
            <div className="font-medium text-white">{userName}</div>
            {userRole ? <div className="text-xs text-slate-500">{userRole}</div> : null}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
