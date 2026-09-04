import { describe, expect, it } from 'vitest'

import { formatApiDetail, isLanDiscovery } from './ipamDiscover'

describe('isLanDiscovery', () => {
  it('treats gateway probes as LAN, not Docker', () => {
    expect(isLanDiscovery({ cidr: '192.168.0.0/24', interface: 'auto-detected' })).toBe(true)
    expect(isLanDiscovery({ cidr: '192.168.1.0/24', interface: 'configured' })).toBe(true)
    expect(isLanDiscovery({ cidr: '172.20.0.0/16', interface: 'eth0' })).toBe(false)
  })
})

describe('formatApiDetail', () => {
  it('flattens FastAPI validation errors', () => {
    expect(formatApiDetail([{ loc: ['body', 'name'], msg: 'Field required', type: 'missing' }])).toBe(
      'Field required',
    )
  })
})
