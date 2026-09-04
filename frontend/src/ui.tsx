import { ReactNode } from 'react'

export const fieldClass =
  'w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20'

export const labelClass = 'mb-1.5 block text-sm font-medium text-slate-300'

export const cardClass = 'rounded-xl border border-white/10 bg-[#151b24] p-5'

export const tableWrapClass = 'overflow-x-auto rounded-xl border border-white/10 bg-[#151b24]'

export const theadClass = 'bg-[#0b1220] text-xs font-medium uppercase tracking-wide text-slate-500'

export const thClass = 'px-4 py-3 text-left font-medium'
export const tdClass = 'px-4 py-3.5'
export const trClass = 'border-t border-white/5 hover:bg-white/[0.03]'

export const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60'

export const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-60'

export const btnDanger =
  'inline-flex items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20'

export const btnGhost =
  'inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/5'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const map = {
    neutral: 'bg-white/10 text-slate-300',
    success: 'bg-emerald-500/15 text-emerald-300',
    warning: 'bg-amber-500/15 text-amber-300',
    danger: 'bg-rose-500/15 text-rose-300',
    info: 'bg-indigo-500/15 text-indigo-300',
  }
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>
}

export function Alert({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'success' | 'info' }) {
  const map = {
    danger: 'border-rose-500/20 bg-rose-500/10 text-rose-200',
    success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
    info: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-200',
  }
  return <p className={`rounded-lg border px-3 py-2 text-sm ${map[tone]}`}>{children}</p>
}

export function EmptyState({ children, colSpan }: { children: ReactNode; colSpan?: number }) {
  if (colSpan) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-slate-500">
          {children}
        </td>
      </tr>
    )
  }
  return <p className="px-4 py-12 text-center text-sm text-slate-500">{children}</p>
}

export function KpiCard({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#151b24] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  )
}
