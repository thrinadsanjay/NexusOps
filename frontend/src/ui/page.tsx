import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export type Crumb = { label: string; to?: string }

export function PageHeader({
  crumbs,
  title,
  description,
  actions,
}: {
  crumbs: Crumb[]
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          <ol className="flex flex-wrap items-center gap-1.5">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && (
                  <span className="text-faint" aria-hidden="true">
                    /
                  </span>
                )}
                {crumb.to && index < crumbs.length - 1 ? (
                  <Link to={crumb.to} className="hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={index === crumbs.length - 1 ? 'text-accent' : 'text-muted'}>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
