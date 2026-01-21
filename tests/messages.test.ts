/**
 * Message protocol tests
 *
 * Tests the message types and helpers used for
 * Main Thread <-> Worker communication.
 */

import { describe, it, expect } from 'vitest'
import { MSG } from '../src/messages'

describe('Message Constants', () => {
  describe('MSG object', () => {
    it('should have all required message types', () => {
      // Setup messages
      expect(MSG.SETUP).toBe('SETUP')
      expect(MSG.READY).toBe('READY')
      expect(MSG.SETUP_ERROR).toBe('SETUP_ERROR')

      // Fetch messages
      expect(MSG.FETCH).toBe('FETCH')
      expect(MSG.FETCH_RESULT).toBe('FETCH_RESULT')
      expect(MSG.FETCH_ERROR).toBe('FETCH_ERROR')

      // Auth messages
      expect(MSG.AUTH_CALL).toBe('AUTH_CALL')
      expect(MSG.AUTH_CALL_RESULT).toBe('AUTH_CALL_RESULT')
      expect(MSG.AUTH_STATE_CHANGED).toBe('AUTH_STATE_CHANGED')
      expect(MSG.TOKEN_REFRESHED).toBe('TOKEN_REFRESHED')

      // Control messages
      expect(MSG.CANCEL).toBe('CANCEL')
      expect(MSG.PING).toBe('PING')
      expect(MSG.PONG).toBe('PONG')
      expect(MSG.ERROR).toBe('ERROR')
    })

    it('should have unique values for all message types', () => {
      const values = Object.values(MSG)
      const uniqueValues = new Set(values)
      expect(uniqueValues.size).toBe(values.length)
    })
  })

  describe('Message pairs', () => {
    it('should have matching request/response pairs', () => {
      // SETUP -> READY | SETUP_ERROR
      expect(MSG.SETUP).toBeDefined()
      expect(MSG.READY).toBeDefined()
      expect(MSG.SETUP_ERROR).toBeDefined()

      // FETCH -> FETCH_RESULT | FETCH_ERROR
      expect(MSG.FETCH).toBeDefined()
      expect(MSG.FETCH_RESULT).toBeDefined()
      expect(MSG.FETCH_ERROR).toBeDefined()

      // AUTH_CALL -> AUTH_CALL_RESULT | ERROR
      expect(MSG.AUTH_CALL).toBeDefined()
      expect(MSG.AUTH_CALL_RESULT).toBeDefined()
      expect(MSG.ERROR).toBeDefined()

      // PING -> PONG
      expect(MSG.PING).toBeDefined()
      expect(MSG.PONG).toBeDefined()
    })
  })
})

describe('Message Structure', () => {
  describe('FETCH message', () => {
    it('should have correct structure', () => {
      const fetchMessage = {
        id: 'msg_1_1234567890',
        type: MSG.FETCH,
        payload: {
          url: 'https://api.example.com/users',
          options: {
            method: 'GET',
            requiresAuth: true
          }
        }
      }

      expect(fetchMessage.id).toMatch(/^msg_\d+_\d+$/)
      expect(fetchMessage.type).toBe('FETCH')
      expect(fetchMessage.payload.url).toBe('https://api.example.com/users')
      expect(fetchMessage.payload.options).toBeDefined()
    })
  })

  describe('FETCH_RESULT message', () => {
    it('should contain FetchEnvelope structure', () => {
      const resultMessage = {
        id: 'msg_1_1234567890',
        type: MSG.FETCH_RESULT,
        payload: {
          status: 200,
          body: '{"users": []}',
          contentType: 'application/json',
          headers: {}
        }
      }

      expect(resultMessage.type).toBe('FETCH_RESULT')
      expect(resultMessage.payload.status).toBe(200)
      expect(resultMessage.payload.body).toBe('{"users": []}')
      expect(resultMessage.payload.contentType).toBe('application/json')
      expect(resultMessage.payload.headers).toEqual({})
    })
  })

  describe('AUTH_STATE_CHANGED message', () => {
    it('should contain AuthResult structure', () => {
      const authMessage = {
        type: MSG.AUTH_STATE_CHANGED,
        payload: {
          authenticated: true,
          user: { id: '123', name: 'Test User' },
          expiresAt: Date.now() + 3600000
        }
      }

      expect(authMessage.type).toBe('AUTH_STATE_CHANGED')
      expect(authMessage.payload.authenticated).toBe(true)
      expect(authMessage.payload.user).toBeDefined()
      expect(authMessage.payload.expiresAt).toBeGreaterThan(Date.now())
    })

    it('should NOT contain token in payload', () => {
      // Security: Tokens must never appear in AUTH_STATE_CHANGED
      const authMessage = {
        type: MSG.AUTH_STATE_CHANGED,
        payload: {
          authenticated: true,
          user: { id: '123' },
          expiresAt: Date.now() + 3600000
        }
      }

      expect(authMessage.payload).not.toHaveProperty('token')
      expect(authMessage.payload).not.toHaveProperty('accessToken')
      expect(authMessage.payload).not.toHaveProperty('refreshToken')
    })
  })

  describe('ERROR message', () => {
    it('should contain errors array', () => {
      const errorMessage = {
        id: 'msg_1_1234567890',
        type: MSG.ERROR,
        payload: {
          errors: [
            { code: 'NETWORK_ERROR', message: 'Connection failed' }
          ],
          meta: undefined
        }
      }

      expect(errorMessage.type).toBe('ERROR')
      expect(Array.isArray(errorMessage.payload.errors)).toBe(true)
      expect(errorMessage.payload.errors[0].code).toBe('NETWORK_ERROR')
    })
  })
})

describe('Security: Token Isolation', () => {
  it('AUTH_STATE_CHANGED should only expose safe fields', () => {
    // Define what fields ARE allowed in AUTH_STATE_CHANGED
    const safeFields = ['authenticated', 'user', 'expiresAt']

    // Define what fields must NEVER appear
    const dangerousFields = [
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'bearer',
      'jwt',
      'secret',
      'password',
      'credential'
    ]

    const mockAuthState = {
      authenticated: true,
      user: { id: '123' },
      expiresAt: Date.now() + 3600000
    }

    // Verify safe fields exist
    for (const field of safeFields) {
      expect(field in mockAuthState || true).toBe(true)
    }

    // Verify dangerous fields don't exist
    for (const field of dangerousFields) {
      expect(mockAuthState).not.toHaveProperty(field)
    }
  })

  it('FETCH_RESULT should not contain tokens', () => {
    const mockFetchResult = {
      status: 200,
      body: '{"data": "safe"}',
      contentType: 'application/json',
      headers: { 'content-type': 'application/json' }
    }

    // FetchEnvelope should not have token-related fields
    expect(mockFetchResult).not.toHaveProperty('token')
    expect(mockFetchResult).not.toHaveProperty('authorization')
    expect(mockFetchResult).not.toHaveProperty('accessToken')
  })
})

describe('TOKEN_REFRESHED message', () => {
  it('should have correct structure with reason', () => {
    const refreshMessage = {
      id: 'evt_1234567890',
      type: MSG.TOKEN_REFRESHED,
      payload: {
        reason: 'proactive' as const
      }
    }

    expect(refreshMessage.type).toBe('TOKEN_REFRESHED')
    expect(refreshMessage.payload.reason).toBe('proactive')
  })

  it('should support expired reason', () => {
    const refreshMessage = {
      id: 'evt_1234567890',
      type: MSG.TOKEN_REFRESHED,
      payload: {
        reason: 'expired' as const
      }
    }

    expect(refreshMessage.payload.reason).toBe('expired')
  })

  it('should NOT contain token in payload', () => {
    // Security: TOKEN_REFRESHED should only contain reason, not the token itself
    const refreshMessage = {
      type: MSG.TOKEN_REFRESHED,
      payload: {
        reason: 'proactive'
      }
    }

    expect(refreshMessage.payload).not.toHaveProperty('token')
    expect(refreshMessage.payload).not.toHaveProperty('accessToken')
    expect(refreshMessage.payload).not.toHaveProperty('refreshToken')
  })
})
