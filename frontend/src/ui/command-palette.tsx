import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { apiFetch } from '../api/client'
import { NAV_GROUPS } from '../layout/navigation'

type PaletteItem = {
  id: string
  label: string
  hint: string
  to: string
  group: string
}

function normalize(value: string): string {
  return value.toLowerCase()
}

export function CommandPalette({
  open,
  onClose,
  canAccess,
}: {
  open: boolean
  onClose: () => void
  canAccess: (permission: string | null) => boolean
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [extra, setExtra] = useState<PaletteItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const pages = useMemo<PaletteItem[]>(() => {
    return NAV_GROUPS.flatMap((group) =>
      group.items
        .filter((item) => canAccess(item.permission))
        .map((item) => ({
          id: `page:${item.to}`,
          label: item.label,
          hint: item.description,
          to: item.to,
          group: group.label,
        })),
    )
  }, [canAccess])

  useEffect(() => {
    if (!open) {
      return
    }
    setQuery('')
    setActive(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    let cancelled = false
    const load = async () => {
      const [hosts, subnets, users, certs] = await Promise.all([
        canAccess('inventory:read') ? apiFetch('/api/v1/inventory/hosts').then((r) => (r.ok ? r.json() : [])).catch(() => []) : [],
        canAccess('ipam:read') ? apiFetch('/api/v1/ipam/subnets').then((r) => (r.ok ? r.json() : [])).catch(() => []) : [],
        canAccess('users:read') ? apiFetch('/api/v1/users').then((r) => (r.ok ? r.json() : [])).catch(() => []) : [],
        canAccess('pki:read') ? apiFetch('/api/v1/pki/certificates').then((r) => (r.ok ? r.json() : [])).catch(() => []) : [],
      ])
      if (cancelled) return
      const items: PaletteItem[] = []
      for (const host of Array.isArray(hosts) ? hosts : []) {
        items.push({
          id: `host:${host.id}`,
          label: host.hostname,
          hint: [host.ip_address, host.fqdn].filter(Boolean).join(' · ') || 'Host',
          to: '/inventory',
          group: 'Hosts',
        })
      }
      for (const subnet of Array.isArray(subnets) ? subnets : []) {
        items.push({
          id: `subnet:${subnet.id}`,
          label: subnet.cidr,
          hint: subnet.name || 'Subnet',
          to: '/ipam/subnets',
          group: 'Subnets',
        })
      }
      for (const user of Array.isArray(users) ? users : []) {
        items.push({
          id: `user:${user.id}`,
          label: user.username,
          hint: user.email || 'User',
          to: '/users',
          group: 'Users',
        })
      }
      for (const cert of Array.isArray(certs) ? certs : []) {
        items.push({
          id: `cert:${cert.id}`,
          label: cert.common_name,
          hint: cert.serial_number || cert.cert_type || 'Certificate',
          to: '/pki',
          group: 'Certificates',
        })
      }
      setExtra(items)
    }
    void load()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, canAccess])

  const results = useMemo(() => {
    const haystack = [...pages, ...extra]
    const q = normalize(query.trim())
    if (!q) {
      return haystack.slice(0, 12)
    }
    return haystack
      .filter((item) => normalize(`${item.label} ${item.hint} ${item.group}`).includes(q))
      .slice(0, 20)
  }, [pages, extra, query])

  useEffect(() => {
    setActive(0)
  }, [query, results.length])

  const go = (item: PaletteItem | undefined) => {
    if (!item) return
    onClose()
    navigate(item.to)
  }

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-canvas/70 p-4 pt-[12vh]" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages, hosts, CIDRs, users, certificates…"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm text-ink outline-none"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((value) => Math.min(results.length - 1, value + 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((value) => Math.max(0, value - 1))
            } else if (event.key === 'Home') {
              event.preventDefault()
              setActive(0)
            } else if (event.key === 'End') {
              event.preventDefault()
              setActive(Math.max(0, results.length - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              go(results[active])
            } else if (event.key === 'Escape') {
              onClose()
            }
          }}
        />
        <ul className="max-h-80 overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">No matches.</li>
          ) : (
            results.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left ${index === active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-elevated'}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item)}
                >
                  <span>
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block text-xs text-muted">{item.hint}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-faint">{item.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
