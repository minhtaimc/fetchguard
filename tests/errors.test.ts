/**
 * Error definitions tests
 *
 * Tests that error factories work correctly with ts-micro-result v3.
 */

import { describe, it, expect } from 'vitest'
import {
  GeneralErrors,
  InitErrors,
  AuthErrors,
  DomainErrors,
  RequestErrors
} from '../src/errors'

describe('Error Definitions', () => {
  describe('GeneralErrors', () => {
    it('should create Unexpected error', () => {
      const error = GeneralErrors.Unexpected()
      expect(error.code).toBe('UNEXPECTED')
      expect(error.message).toBe('Unexpected error')
    })

    it('should create UnknownMessage error', () => {
      const error = GeneralErrors.UnknownMessage()
      expect(error.code).toBe('UNKNOWN_MESSAGE')
      expect(error.message).toBe('Unknown message type')
    })

    it('should create ResultParse error', () => {
      const error = GeneralErrors.ResultParse()
      expect(error.code).toBe('RESULT_PARSE_ERROR')
      expect(error.message).toBe('Failed to parse result')
    })
  })

  describe('InitErrors', () => {
    it('should create NotInitialized error', () => {
      const error = InitErrors.NotInitialized()
      expect(error.code).toBe('INIT_ERROR')
      expect(error.message).toBe('Worker not initialized')
    })

    it('should create ProviderInitFailed error', () => {
      const error = InitErrors.ProviderInitFailed()
      expect(error.code).toBe('PROVIDER_INIT_FAILED')
      expect(error.message).toBe('Failed to initialize provider')
    })

    it('should create InitFailed error', () => {
      const error = InitErrors.InitFailed()
      expect(error.code).toBe('INIT_FAILED')
      expect(error.message).toBe('Initialization failed')
    })
  })

  describe('AuthErrors', () => {
    it('should create TokenRefreshFailed error', () => {
      const error = AuthErrors.TokenRefreshFailed()
      expect(error.code).toBe('TOKEN_REFRESH_FAILED')
      expect(error.message).toBe('Token refresh failed')
    })

    it('should create LoginFailed error', () => {
      const error = AuthErrors.LoginFailed()
      expect(error.code).toBe('LOGIN_FAILED')
      expect(error.message).toBe('Login failed')
    })

    it('should create LogoutFailed error', () => {
      const error = AuthErrors.LogoutFailed()
      expect(error.code).toBe('LOGOUT_FAILED')
      expect(error.message).toBe('Logout failed')
    })

    it('should create NotAuthenticated error', () => {
      const error = AuthErrors.NotAuthenticated()
      expect(error.code).toBe('NOT_AUTHENTICATED')
      expect(error.message).toBe('User is not authenticated')
    })
  })

  describe('DomainErrors', () => {
    it('should create NotAllowed error with url parameter', () => {
      const error = DomainErrors.NotAllowed({ url: 'https://evil.com' })
      expect(error.code).toBe('DOMAIN_NOT_ALLOWED')
      expect(error.message).toBe('Domain not allowed: https://evil.com')
    })

    it('should handle missing url parameter', () => {
      const error = DomainErrors.NotAllowed({})
      expect(error.code).toBe('DOMAIN_NOT_ALLOWED')
      // Message template should handle missing param gracefully
      expect(error.message).toContain('Domain not allowed')
    })
  })

  describe('RequestErrors', () => {
    it('should create NetworkError', () => {
      const error = RequestErrors.NetworkError()
      expect(error.code).toBe('NETWORK_ERROR')
      expect(error.message).toBe('Network error')
    })

    it('should create NetworkError with custom message', () => {
      const error = RequestErrors.NetworkError({ message: 'Connection timeout' })
      expect(error.code).toBe('NETWORK_ERROR')
      expect(error.message).toBe('Connection timeout')
    })

    it('should create Cancelled error', () => {
      const error = RequestErrors.Cancelled()
      expect(error.code).toBe('REQUEST_CANCELLED')
      expect(error.message).toBe('Request was cancelled')
    })

    it('should create HttpError with status', () => {
      const error = RequestErrors.HttpError({ status: 404 })
      expect(error.code).toBe('HTTP_ERROR')
      expect(error.message).toBe('HTTP 404 error')
    })

    it('should create HttpError with various status codes', () => {
      expect(RequestErrors.HttpError({ status: 400 }).message).toBe('HTTP 400 error')
      expect(RequestErrors.HttpError({ status: 401 }).message).toBe('HTTP 401 error')
      expect(RequestErrors.HttpError({ status: 403 }).message).toBe('HTTP 403 error')
      expect(RequestErrors.HttpError({ status: 500 }).message).toBe('HTTP 500 error')
      expect(RequestErrors.HttpError({ status: 503 }).message).toBe('HTTP 503 error')
    })

    it('should create ResponseParseFailed error', () => {
      const error = RequestErrors.ResponseParseFailed()
      expect(error.code).toBe('RESPONSE_PARSE_FAILED')
      expect(error.message).toBe('Failed to parse response body')
    })

    it('should create QueueFull error with size parameters', () => {
      const error = RequestErrors.QueueFull({ size: 1000, maxSize: 1000 })
      expect(error.code).toBe('QUEUE_FULL')
      expect(error.message).toBe('Request queue full (1000/1000)')
    })

    it('should create QueueFull error with different sizes', () => {
      expect(RequestErrors.QueueFull({ size: 500, maxSize: 500 }).message).toBe('Request queue full (500/500)')
      expect(RequestErrors.QueueFull({ size: 100, maxSize: 100 }).message).toBe('Request queue full (100/100)')
    })
  })
})

describe('Error Structure (ts-micro-result v3)', () => {
  it('should have code and message properties', () => {
    const error = AuthErrors.LoginFailed()

    expect(error).toHaveProperty('code')
    expect(error).toHaveProperty('message')
    expect(typeof error.code).toBe('string')
    expect(typeof error.message).toBe('string')
  })

  it('should be usable with err() function', () => {
    // This tests the integration with ts-micro-result
    const error = AuthErrors.LoginFailed()

    // Error should be valid for err() - has required properties
    expect(error.code).toBeTruthy()
    expect(error.message).toBeTruthy()
  })
})

describe('Error Codes Uniqueness', () => {
  it('should have unique error codes across all categories', () => {
    const allErrors = [
      ...Object.values(GeneralErrors),
      ...Object.values(InitErrors),
      ...Object.values(AuthErrors),
      ...Object.values(DomainErrors),
      ...Object.values(RequestErrors)
    ]

    const codes = allErrors.map(factory => factory({} as any).code)
    const uniqueCodes = new Set(codes)

    expect(uniqueCodes.size).toBe(codes.length)
  })
})
