import { type ReactNode, useEffect, useState } from 'react'

const DENSITY_KEY = 'nexusops-table-density'
const listeners = new Set<() => void>()

function readCompact(): boolean {
  try {
    return localStorage.getItem(DENSITY_KEY) === 'compact'
  } catch {
    return false
  }
}

let compactValue = false
if (typeof window !== 'undefined') {
  compactValue = readCompact()
}

function setCompactValue(next: boolean) {
  compactValue = next
  try {
    localStorage.setItem(DENSITY_KEY, next ? 'compact' : 'comfortable')
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener())
}

export function useTableDensity() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const onChange = () => setTick((value) => value + 1)
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [])

  return {
    compact: compactValue,
    setCompact: setCompactValue,
    cell: compactValue ? 'px-3 py-2' : 'px-4 py-3.5',
  }
}

export function FilterBar({ children }: { children?: ReactNode }) {
  const { compact, setCompact } = useTableDensity()
  return (
    <div className="flex flex-wrap items-center gap-3">
      {children}
      <button
        type="button"
        className="ml-auto rounded-xl border border-line px-3 py-2 text-xs font-medium text-muted hover:bg-elevated"
        aria-pressed={compact}
        onClick={() => setCompact(!compact)}
      >
        {compact ? 'Comfortable rows' : 'Compact rows'}
      </button>
    </div>
  )
}

export function TableFrame({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">{children}</div>
}

export function Table({ children }: { children: ReactNode }) {
  return <table className="min-w-full divide-y divide-line text-left text-sm">{children}</table>
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-canvas/95 text-muted backdrop-blur">{children}</thead>
}

export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <tr key={index}>
          <td colSpan={cols} className="px-4 py-3">
            <div className="h-4 animate-pulse rounded bg-elevated" />
          </td>
        </tr>
      ))}
    </>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  const { cell } = useTableDensity()
  return <td className={`${cell} ${className}`}>{children}</td>
}

export function filterInputClass(extra = '') {
  return `min-w-[180px] flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-accent ${extra}`
}

export function filterSelectClass(extra = '') {
  return `rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-accent ${extra}`
}
