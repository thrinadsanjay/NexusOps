const TOKEN_KEY = 'nexusops_token'
const USER_KEY = 'nexusops_user'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY) ?? ''
}

export function storeAuth(token: string, user: unknown): void {
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function readStoredUser<T>(): T | null {
  const raw = sessionStorage.getItem(USER_KEY) ?? localStorage.getItem(USER_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function clearAuth(): void {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function authHeaders(json = true): HeadersInit {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (json) {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = {
    ...authHeaders(Boolean(init.body)),
    ...(init.headers ?? {}),
  }
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })
}
