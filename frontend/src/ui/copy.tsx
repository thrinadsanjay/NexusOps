import { useState } from 'react'

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <button
      type="button"
      className="rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted hover:bg-elevated hover:text-ink"
      aria-label={`Copy ${label ?? value}`}
      title={`Copy ${label ?? value}`}
      onClick={(event) => {
        event.stopPropagation()
        void copy()
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function CopyText({ value, label, className }: { value: string; label?: string; className?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 ${className ?? ''}`}>
      <span className="truncate font-mono">{value}</span>
      <CopyButton value={value} label={label} />
    </span>
  )
}
