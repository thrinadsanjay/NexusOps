import { useCallback, useEffect, useRef, useState } from 'react'

type Pending = {
  title: string
  body: string
  confirmLabel: string
  resolve: (value: boolean) => void
}

let askConfirm: ((pending: Omit<Pending, 'resolve'>) => Promise<boolean>) | null = null

export async function confirmAction(title: string, body: string, confirmLabel = 'Delete'): Promise<boolean> {
  if (askConfirm) {
    return askConfirm({ title, body, confirmLabel })
  }
  return window.confirm(`${title}\n\n${body}`)
}

export async function confirmDelete(what: string): Promise<boolean> {
  return confirmAction(`Delete ${what}?`, 'This cannot be undone.', 'Delete')
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const ask = useCallback((input: Omit<Pending, 'resolve'>) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...input, resolve })
    })
  }, [])

  useEffect(() => {
    askConfirm = ask
    return () => {
      if (askConfirm === ask) {
        askConfirm = null
      }
    }
  }, [ask])

  useEffect(() => {
    if (!pending) {
      return
    }
    confirmRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        pending.resolve(false)
        setPending(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  if (!pending) {
    return null
  }

  const close = (value: boolean) => {
    pending.resolve(value)
    setPending(null)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-canvas/70 p-4" role="presentation" onClick={() => close(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-ink">
          {pending.title}
        </h2>
        <p id="confirm-body" className="mt-2 text-sm text-muted">
          {pending.body}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="nx-btn-ghost px-3 py-2 text-sm" onClick={() => close(false)}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" className="rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-accent-fg" onClick={() => close(true)}>
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
