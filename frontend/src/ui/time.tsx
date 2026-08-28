import { useEffect, useState } from 'react'

function formatRelative(iso: string, now: number): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) {
    return iso
  }
  const delta = Math.round((then - now) / 1000)
  const abs = Math.abs(delta)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 45) return rtf.format(Math.round(delta), 'second')
  if (abs < 45 * 60) return rtf.format(Math.round(delta / 60), 'minute')
  if (abs < 22 * 60 * 60) return rtf.format(Math.round(delta / 3600), 'hour')
  if (abs < 26 * 60 * 60 * 24) return rtf.format(Math.round(delta / 86400), 'day')
  return rtf.format(Math.round(delta / 604800), 'week')
}

export function RelativeTime({ value, className }: { value: string | null | undefined; className?: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  if (!value) {
    return <span className={className}>—</span>
  }

  const absolute = new Date(value).toLocaleString()
  return (
    <time dateTime={value} title={absolute} className={className}>
      {formatRelative(value, now)}
    </time>
  )
}
