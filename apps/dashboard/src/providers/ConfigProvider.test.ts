import { describe, expect, it } from 'vitest'
import { shouldPersistOidcState } from './oidcStateStore'

describe('shouldPersistOidcState', () => {
  it('persists callback state for proxied local development domains', () => {
    expect(shouldPersistOidcState('dev.boxlite.ai', true)).toBe(true)
  })

  it('keeps production custom domains in memory storage', () => {
    expect(shouldPersistOidcState('dev.boxlite.ai', false)).toBe(false)
  })

  it('persists callback state for localhost even outside Vite dev mode', () => {
    expect(shouldPersistOidcState('localhost', false)).toBe(true)
    expect(shouldPersistOidcState('127.0.0.1', false)).toBe(true)
    expect(shouldPersistOidcState('::1', false)).toBe(true)
  })
})
