/**
 * Error codes tests
 *
 * Tests for ERROR_CODES constants and type exports.
 */

import { describe, it, expect } from 'vitest'
import { ERROR_CODES } from '../src/error-codes'
import type { ErrorCode, ErrorCodeKey } from '../src/error-codes'
import {
  GeneralErrors,
  InitErrors,
  AuthErrors,
  DomainErrors,
  RequestErrors
} from '../src/errors'

describe('ERROR_CODES', () => {
  describe('General error codes', () => {
    it('should have UNEXPECTED code', () => {
      expect(ERROR_CODES.UNEXPECTED).toBe('UNEXPECTED')
    })

    it('should have UNKNOWN_MESSAGE code', () => {
      expect(ERROR_CODES.UNKNOWN_MESSAGE).toBe('UNKNOWN_MESSAGE')
    })

    it('should have RESULT_PARSE_ERROR code', () => {
      expect(ERROR_CODES.RESULT_PARSE_ERROR).toBe('RESULT_PARSE_ERROR')
    })
  })

  describe('Init error codes', () => {
    it('should have INIT_ERROR code', () => {
      expect(ERROR_CODES.INIT_ERROR).toBe('INIT_ERROR')
    })

    it('should have PROVIDER_INIT_FAILED code', () => {
      expect(ERROR_CODES.PROVIDER_INIT_FAILED).toBe('PROVIDER_INIT_FAILED')
    })

    it('should have INIT_FAILED code', () => {
      expect(ERROR_CODES.INIT_FAILED).toBe('INIT_FAILED')
    })
  })

  describe('Auth error codes', () => {
    it('should have TOKEN_REFRESH_FAILED code', () => {
      expect(ERROR_CODES.TOKEN_REFRESH_FAILED).toBe('TOKEN_REFRESH_FAILED')
    })

    it('should have LOGIN_FAILED code', () => {
      expect(ERROR_CODES.LOGIN_FAILED).toBe('LOGIN_FAILED')
    })

    it('should have LOGOUT_FAILED code', () => {
      expect(ERROR_CODES.LOGOUT_FAILED).toBe('LOGOUT_FAILED')
    })

    it('should have NOT_AUTHENTICATED code', () => {
      expect(ERROR_CODES.NOT_AUTHENTICATED).toBe('NOT_AUTHENTICATED')
    })
  })

  describe('Domain error codes', () => {
    it('should have DOMAIN_NOT_ALLOWED code', () => {
      expect(ERROR_CODES.DOMAIN_NOT_ALLOWED).toBe('DOMAIN_NOT_ALLOWED')
    })
  })

  describe('Request error codes', () => {
    it('should have NETWORK_ERROR code', () => {
      expect(ERROR_CODES.NETWORK_ERROR).toBe('NETWORK_ERROR')
    })

    it('should have REQUEST_CANCELLED code', () => {
      expect(ERROR_CODES.REQUEST_CANCELLED).toBe('REQUEST_CANCELLED')
    })

    it('should have HTTP_ERROR code', () => {
      expect(ERROR_CODES.HTTP_ERROR).toBe('HTTP_ERROR')
    })

    it('should have RESPONSE_PARSE_FAILED code', () => {
      expect(ERROR_CODES.RESPONSE_PARSE_FAILED).toBe('RESPONSE_PARSE_FAILED')
    })

    it('should have QUEUE_FULL code', () => {
      expect(ERROR_CODES.QUEUE_FULL).toBe('QUEUE_FULL')
    })

    it('should have REQUEST_TIMEOUT code', () => {
      expect(ERROR_CODES.REQUEST_TIMEOUT).toBe('REQUEST_TIMEOUT')
    })
  })
})

describe('ERROR_CODES matches error factories', () => {
  it('GeneralErrors should use ERROR_CODES', () => {
    expect(GeneralErrors.Unexpected().code).toBe(ERROR_CODES.UNEXPECTED)
    expect(GeneralErrors.UnknownMessage().code).toBe(ERROR_CODES.UNKNOWN_MESSAGE)
    expect(GeneralErrors.ResultParse().code).toBe(ERROR_CODES.RESULT_PARSE_ERROR)
  })

  it('InitErrors should use ERROR_CODES', () => {
    expect(InitErrors.NotInitialized().code).toBe(ERROR_CODES.INIT_ERROR)
    expect(InitErrors.ProviderInitFailed().code).toBe(ERROR_CODES.PROVIDER_INIT_FAILED)
    expect(InitErrors.InitFailed().code).toBe(ERROR_CODES.INIT_FAILED)
  })

  it('AuthErrors should use ERROR_CODES', () => {
    expect(AuthErrors.TokenRefreshFailed().code).toBe(ERROR_CODES.TOKEN_REFRESH_FAILED)
    expect(AuthErrors.LoginFailed().code).toBe(ERROR_CODES.LOGIN_FAILED)
    expect(AuthErrors.LogoutFailed().code).toBe(ERROR_CODES.LOGOUT_FAILED)
    expect(AuthErrors.NotAuthenticated().code).toBe(ERROR_CODES.NOT_AUTHENTICATED)
  })

  it('DomainErrors should use ERROR_CODES', () => {
    expect(DomainErrors.NotAllowed({ url: 'test' }).code).toBe(ERROR_CODES.DOMAIN_NOT_ALLOWED)
  })

  it('RequestErrors should use ERROR_CODES', () => {
    expect(RequestErrors.NetworkError().code).toBe(ERROR_CODES.NETWORK_ERROR)
    expect(RequestErrors.Cancelled().code).toBe(ERROR_CODES.REQUEST_CANCELLED)
    expect(RequestErrors.HttpError({ status: 404 }).code).toBe(ERROR_CODES.HTTP_ERROR)
    expect(RequestErrors.ResponseParseFailed().code).toBe(ERROR_CODES.RESPONSE_PARSE_FAILED)
    expect(RequestErrors.QueueFull({ size: 1, maxSize: 1 }).code).toBe(ERROR_CODES.QUEUE_FULL)
    expect(RequestErrors.Timeout().code).toBe(ERROR_CODES.REQUEST_TIMEOUT)
  })
})

describe('Type exports', () => {
  it('ErrorCode should be a valid union type', () => {
    // This test ensures the type works at compile time
    const code: ErrorCode = 'NETWORK_ERROR'
    expect(code).toBe('NETWORK_ERROR')
  })

  it('ErrorCodeKey should be a valid key type', () => {
    // This test ensures the type works at compile time
    const key: ErrorCodeKey = 'NETWORK_ERROR'
    expect(ERROR_CODES[key]).toBe('NETWORK_ERROR')
  })

  it('should allow type-safe error matching', () => {
    const error = { code: ERROR_CODES.NETWORK_ERROR, message: 'Connection failed' }

    // Type-safe matching
    if (error.code === ERROR_CODES.NETWORK_ERROR) {
      expect(error.code).toBe('NETWORK_ERROR')
    }
  })
})

describe('Error code uniqueness', () => {
  it('should have unique values', () => {
    const values = Object.values(ERROR_CODES)
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  it('should have matching keys and values', () => {
    // All ERROR_CODES keys should match their values
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(key).toBe(value)
    }
  })
})
