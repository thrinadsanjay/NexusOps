import { afterEach, describe, expect, it } from 'vitest'

import { apiBaseUrl } from './apiBase'

describe('apiBaseUrl', () => {
  afterEach(() => {
    delete window.__NEXUSOPS_RUNTIME
  })

  it('prefers runtime config over Vite env', () => {
    window.__NEXUSOPS_RUNTIME = { apiBaseUrl: 'http://lab.example:8000/' }
    expect(apiBaseUrl()).toBe('http://lab.example:8000')
  })

  it('uses an empty string for same-origin nginx proxy', () => {
    window.__NEXUSOPS_RUNTIME = { apiBaseUrl: '' }
    expect(apiBaseUrl()).toBe('')
  })

  it('falls back to localhost when runtime config is absent', () => {
    delete window.__NEXUSOPS_RUNTIME
    expect(apiBaseUrl()).toBe('http://localhost:8000')
  })
})
