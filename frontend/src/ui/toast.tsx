import { useCallback, useEffect, useState } from 'react'

export type ToastKind = 'ok' | 'error' | 'info'

type ToastItem = {
  id: number
  kind: ToastKind
  message: string
}

type ToastApi = {
  ok: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

let pushToast: ((kind: ToastKind, message: string) => void) | null = null

export const toast: ToastApi = {
  ok: (message) => pushToast?.('ok', message),
  error: (message) => pushToast?.('error', message),
  info: (message) => pushToast?.('info', message),
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random()
    setItems((current) => [...current.slice(-4), { id, kind, message }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, 4200)
  }, [])

  useEffect(() => {
    pushToast = push
    return () => {
      if (pushToast === push) {
        pushToast = null
      }
    }
  }, [push])

  if (items.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(100%-2rem,22rem)] flex-col gap-2" role="status" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto rounded-xl border px-3 py-2.5 text-sm shadow-card ${
            item.kind === 'error'
              ? 'border-danger/30 bg-surface text-danger'
              : item.kind === 'ok'
                ? 'border-ok/30 bg-surface text-ok'
                : 'border-line bg-surface text-ink'
          }`}
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}
