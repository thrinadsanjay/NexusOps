declare global {
  interface Window {
    __NEXUSOPS_RUNTIME?: { apiBaseUrl?: string }
  }
}

function normalize(url: string): string {
  return url.replace(/\/$/, '')
}

/** API origin the browser should call. Empty string means same-origin (nginx /api proxy). */
export function apiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__NEXUSOPS_RUNTIME) {
    return normalize(window.__NEXUSOPS_RUNTIME.apiBaseUrl || '')
  }
  const env = import.meta.env.VITE_API_BASE_URL
  if (typeof env === 'string' && env.trim()) {
    return normalize(env)
  }
  return 'http://localhost:8000'
}

export const API_BASE_URL = apiBaseUrl()
