import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createProvider } from '../src/provider/create-provider'
import type { RefreshTokenStorage, TokenParser } from '../src/types'

const makeResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const parser: TokenParser = {
  parse: vi.fn(async (response: Response) => {
    const json = await response.json() as any
    return {
      token: json.data.accessToken,
      refreshToken: json.data.refreshToken,
      expiresAt: json.data.expiresAt,
      user: json.data.user
    }
  })
}

const makeStorage = (): RefreshTokenStorage => ({
  get: vi.fn().mockResolvedValue('persisted-refresh-token'),
  set: vi.fn().mockResolvedValue(undefined)
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createProvider', () => {
  it('loads refresh token from storage and stores new token on refresh', async () => {
    const storage = makeStorage()
    const strategy = {
      refresh: vi.fn().mockResolvedValue(
        makeResponse({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresAt: Date.now() + 60_000,
          user: { id: '123' }
        })
      ),
      login: vi.fn(),
      logout: vi.fn()
    }

    const provider = createProvider({ refreshStorage: storage, parser, strategy })
    const result = await provider.refreshToken(null)

    expect(storage.get).toHaveBeenCalledTimes(1)
    expect(strategy.refresh).toHaveBeenCalledWith('persisted-refresh-token')
    expect(result.isOk()).toBe(true)
    expect(result.data?.token).toBe('new-access')
    expect(storage.set).toHaveBeenCalledWith('new-refresh')
  })

  it('returns error when refresh strategy responds with non-OK status', async () => {
    const storage = makeStorage()
    const strategy = {
      refresh: vi.fn().mockResolvedValue(makeResponse({}, 500)),
      login: vi.fn(),
      logout: vi.fn()
    }

    const provider = createProvider({ refreshStorage: storage, parser, strategy })
    const result = await provider.refreshToken('stale-token')

    expect(strategy.refresh).toHaveBeenCalledWith('stale-token')
    expect(result.isError()).toBe(true)
    const error = result.errors?.[0]
    expect(error?.code).toBe('TOKEN_REFRESH_FAILED')
  })

  it('clears storage on logout and returns empty token info', async () => {
    const storage = makeStorage()
    const strategy = {
      refresh: vi.fn(),
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue(makeResponse({}, 200))
    }

    const provider = createProvider({ refreshStorage: storage, parser, strategy })
    const result = await provider.logout()

    expect(strategy.logout).toHaveBeenCalled()
    expect(storage.set).toHaveBeenCalledWith(null)
    expect(result.isOk()).toBe(true)
    expect(result.data?.token).toBe('')
  })
})

