import { Link } from 'react-router-dom'

import { API_BASE_URL } from '../api/client'
import { NAV_GROUPS, type NavGroup } from './navigation'

type SiteFooterProps = {
  groups?: NavGroup[]
  compact?: boolean
}

export function SiteFooter({ groups = NAV_GROUPS, compact = false }: SiteFooterProps) {
  const docsUrl = `${API_BASE_URL.replace(/\/$/, '')}/docs`
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-slate-800/80 bg-slate-950/90" role="contentinfo">
      <div className={`mx-auto max-w-7xl px-6 ${compact ? 'py-5' : 'py-8'}`}>
        <div className="flex flex-col gap-8 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <p className="text-sm font-semibold text-white">NexusOps</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Infrastructure operations platform for networks, inventory, identity, and certificates.
            </p>
          </div>
          {!compact && (
            <nav aria-label="Footer" className="grid flex-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{group.label}</p>
                  <ul className="mt-3 space-y-2">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <Link to={item.to} className="text-sm text-slate-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-slate-800/80 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} NexusOps. Local control plane.</p>
          <p>
            <a href={docsUrl} className="text-slate-400 transition hover:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400" target="_blank" rel="noreferrer">
              API documentation
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
