import { FormEvent, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiFetch } from '../api/client'
import { useTheme, type ThemePreference } from '../theme'
import { toast } from './toast'

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function UserMenu({
  displayName,
  roleLabel,
  onLogout,
}: {
  displayName: string
  roleLabel: string
  onLogout: () => void
}) {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="hidden text-right text-xs leading-4 sm:block">
          <span className="block font-medium text-ink">{displayName}</span>
          <span className="capitalize text-muted">{roleLabel}</span>
        </span>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-ink" aria-hidden="true">
          {initialsFor(displayName)}
        </span>
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-card">
          <p className="px-3 py-2 text-xs text-muted">
            Signed in as <span className="font-medium text-ink">{displayName}</span>
          </p>
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Theme</p>
          <div className="mb-2 grid grid-cols-3 gap-1 px-2">
            {(['light', 'dark', 'system'] as ThemePreference[]).map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={theme === option}
                className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize ${theme === option ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-elevated hover:text-ink'}`}
                onClick={() => setTheme(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-elevated"
            onClick={() => {
              setOpen(false)
              setPasswordOpen(true)
            }}
          >
            Change password
          </button>
          <Link
            to="/settings?tab=password"
            role="menuitem"
            className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-elevated"
            onClick={() => setOpen(false)}
          >
            Account settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          >
            Sign out
          </button>
        </div>
      )}
      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} />}
    </div>
  )
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await apiFetch('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.detail ?? 'Unable to change password')
      }
      toast.ok('Password updated')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-canvas/70 p-4" role="presentation" onClick={onClose}>
      <form
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-card"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="text-lg font-semibold text-ink">Change password</h2>
        <label className="mt-4 block text-sm font-medium text-ink" htmlFor="menu-current-password">
          Current password
        </label>
        <input id="menu-current-password" type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="nx-input mt-1" />
        <label className="mt-3 block text-sm font-medium text-ink" htmlFor="menu-new-password">
          New password
        </label>
        <input id="menu-new-password" type="password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="nx-input mt-1" />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="nx-btn-ghost px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="nx-btn-primary px-3 py-2 text-sm">
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  )
}
