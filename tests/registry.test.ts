import { describe, it, expect, beforeEach } from 'vitest'
import { clearProviders, getProvider, hasProvider, listProviders, registerProvider, unregisterProvider } from '../src/utils/registry'
import type { TokenProvider } from '../src/types'
import { ok } from 'ts-micro-result'

const makeProvider = (): TokenProvider => ({
  async refreshToken() {
    return ok({
      token: 'access-token',
      refreshToken: 'refresh-token'
    })
  },
  async login() {
    return ok({
      token: 'access-token',
      refreshToken: 'refresh-token'
    })
  },
  async logout() {
    return ok({
      token: '',
      refreshToken: undefined
    })
  }
})

beforeEach(() => {
  clearProviders()
})

describe('provider registry', () => {
  it('registers and retrieves providers by name', () => {
    const provider = makeProvider()
    registerProvider('primary', provider)

    expect(hasProvider('primary')).toBe(true)
    expect(listProviders()).toEqual(['primary'])
    expect(getProvider('primary')).toBe(provider)
  })

  it('throws when requesting an unknown provider', () => {
    expect(() => getProvider('missing')).toThrowError(/Provider 'missing' not found/)
  })

  it('unregisters providers', () => {
    registerProvider('to-remove', makeProvider())
    expect(unregisterProvider('to-remove')).toBe(true)
    expect(hasProvider('to-remove')).toBe(false)
  })
})

