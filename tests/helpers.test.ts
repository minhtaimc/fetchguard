/**
 * Helper functions tests
 *
 * Tests for Result pattern helper utilities.
 */

import { describe, it, expect } from 'vitest'
import { ok, err } from 'ts-micro-result'
import type { FetchEnvelope } from '../src/types'
import {
  isNetworkError,
  isSuccess,
  isClientError,
  isServerError,
  parseJson,
  getErrorMessage,
  getErrorBody,
  getStatus,
  hasStatus,
  matchResult
} from '../src/helpers'

// Helper to create FetchEnvelope
function createEnvelope(status: number, body: string = '', contentType: string = 'application/json'): FetchEnvelope {
  return { status, body, contentType, headers: {} }
}

describe('isNetworkError', () => {
  it('should return true for error result', () => {
    const result = err({ code: 'NETWORK_ERROR', message: 'Connection failed' })
    expect(isNetworkError(result)).toBe(true)
  })

  it('should return false for success result', () => {
    const result = ok(createEnvelope(200, '{}'))
    expect(isNetworkError(result)).toBe(false)
  })

  it('should return false for HTTP error (4xx/5xx)', () => {
    const result = ok(createEnvelope(500, '{"error":"Server error"}'))
    expect(isNetworkError(result)).toBe(false)
  })
})

describe('isSuccess', () => {
  it('should return true for 200', () => {
    expect(isSuccess(ok(createEnvelope(200)))).toBe(true)
  })

  it('should return true for 201', () => {
    expect(isSuccess(ok(createEnvelope(201)))).toBe(true)
  })

  it('should return true for 204', () => {
    expect(isSuccess(ok(createEnvelope(204)))).toBe(true)
  })

  it('should return false for 300', () => {
    expect(isSuccess(ok(createEnvelope(300)))).toBe(false)
  })

  it('should return false for 400', () => {
    expect(isSuccess(ok(createEnvelope(400)))).toBe(false)
  })

  it('should return false for 500', () => {
    expect(isSuccess(ok(createEnvelope(500)))).toBe(false)
  })

  it('should return false for network error', () => {
    expect(isSuccess(err({ code: 'NETWORK_ERROR', message: '' }))).toBe(false)
  })
})

describe('isClientError', () => {
  it('should return true for 400', () => {
    expect(isClientError(ok(createEnvelope(400)))).toBe(true)
  })

  it('should return true for 401', () => {
    expect(isClientError(ok(createEnvelope(401)))).toBe(true)
  })

  it('should return true for 404', () => {
    expect(isClientError(ok(createEnvelope(404)))).toBe(true)
  })

  it('should return true for 499', () => {
    expect(isClientError(ok(createEnvelope(499)))).toBe(true)
  })

  it('should return false for 200', () => {
    expect(isClientError(ok(createEnvelope(200)))).toBe(false)
  })

  it('should return false for 500', () => {
    expect(isClientError(ok(createEnvelope(500)))).toBe(false)
  })

  it('should return false for network error', () => {
    expect(isClientError(err({ code: 'NETWORK_ERROR', message: '' }))).toBe(false)
  })
})

describe('isServerError', () => {
  it('should return true for 500', () => {
    expect(isServerError(ok(createEnvelope(500)))).toBe(true)
  })

  it('should return true for 502', () => {
    expect(isServerError(ok(createEnvelope(502)))).toBe(true)
  })

  it('should return true for 503', () => {
    expect(isServerError(ok(createEnvelope(503)))).toBe(true)
  })

  it('should return false for 200', () => {
    expect(isServerError(ok(createEnvelope(200)))).toBe(false)
  })

  it('should return false for 400', () => {
    expect(isServerError(ok(createEnvelope(400)))).toBe(false)
  })

  it('should return false for network error', () => {
    expect(isServerError(err({ code: 'NETWORK_ERROR', message: '' }))).toBe(false)
  })
})

describe('parseJson', () => {
  it('should parse valid JSON body', () => {
    const result = ok(createEnvelope(200, '{"name":"John","age":30}'))
    const data = parseJson<{ name: string; age: number }>(result)
    expect(data).toEqual({ name: 'John', age: 30 })
  })

  it('should return null for invalid JSON', () => {
    const result = ok(createEnvelope(200, 'not json'))
    expect(parseJson(result)).toBeNull()
  })

  it('should return null for network error', () => {
    const result = err({ code: 'NETWORK_ERROR', message: '' })
    expect(parseJson(result)).toBeNull()
  })

  it('should parse arrays', () => {
    const result = ok(createEnvelope(200, '[1,2,3]'))
    expect(parseJson<number[]>(result)).toEqual([1, 2, 3])
  })

  it('should parse nested objects', () => {
    const result = ok(createEnvelope(200, '{"user":{"profile":{"name":"John"}}}'))
    const data = parseJson<{ user: { profile: { name: string } } }>(result)
    expect(data?.user?.profile?.name).toBe('John')
  })
})

describe('getErrorMessage', () => {
  it('should return error message for network error', () => {
    const result = err({ code: 'NETWORK_ERROR', message: 'Connection timeout' })
    expect(getErrorMessage(result)).toBe('Connection timeout')
  })

  it('should return message from JSON body', () => {
    const result = ok(createEnvelope(400, '{"message":"Invalid email"}'))
    expect(getErrorMessage(result)).toBe('Invalid email')
  })

  it('should return error field from JSON body', () => {
    const result = ok(createEnvelope(400, '{"error":"Bad request"}'))
    expect(getErrorMessage(result)).toBe('Bad request')
  })

  it('should fallback to HTTP status when no message in body', () => {
    const result = ok(createEnvelope(404, '{}'))
    expect(getErrorMessage(result)).toBe('HTTP 404')
  })

  it('should fallback to HTTP status for non-JSON body', () => {
    const result = ok(createEnvelope(500, 'Internal Server Error'))
    expect(getErrorMessage(result)).toBe('HTTP 500')
  })

  it('should return Unknown error when no errors array', () => {
    const result = { ok: false as const, errors: [] }
    expect(getErrorMessage(result as any)).toBe('Unknown error')
  })
})

describe('getErrorBody', () => {
  it('should return parsed body for HTTP error', () => {
    const result = ok(createEnvelope(400, '{"code":"VALIDATION_ERROR","errors":[{"field":"email"}]}'))
    const body = getErrorBody<{ code: string; errors: { field: string }[] }>(result)
    expect(body?.code).toBe('VALIDATION_ERROR')
    expect(body?.errors[0]?.field).toBe('email')
  })

  it('should return null for success response', () => {
    const result = ok(createEnvelope(200, '{"data":"success"}'))
    expect(getErrorBody(result)).toBeNull()
  })

  it('should return null for network error', () => {
    const result = err({ code: 'NETWORK_ERROR', message: '' })
    expect(getErrorBody(result)).toBeNull()
  })

  it('should return null for non-JSON body', () => {
    const result = ok(createEnvelope(400, 'Bad Request'))
    expect(getErrorBody(result)).toBeNull()
  })

  it('should work with 5xx errors', () => {
    const result = ok(createEnvelope(500, '{"error":"Internal error"}'))
    const body = getErrorBody<{ error: string }>(result)
    expect(body?.error).toBe('Internal error')
  })
})

describe('getStatus', () => {
  it('should return status code for success response', () => {
    expect(getStatus(ok(createEnvelope(200)))).toBe(200)
    expect(getStatus(ok(createEnvelope(201)))).toBe(201)
    expect(getStatus(ok(createEnvelope(404)))).toBe(404)
    expect(getStatus(ok(createEnvelope(500)))).toBe(500)
  })

  it('should return null for network error', () => {
    const result = err({ code: 'NETWORK_ERROR', message: '' })
    expect(getStatus(result)).toBeNull()
  })
})

describe('hasStatus', () => {
  it('should return true when status matches', () => {
    expect(hasStatus(ok(createEnvelope(200)), 200)).toBe(true)
    expect(hasStatus(ok(createEnvelope(404)), 404)).toBe(true)
  })

  it('should return false when status does not match', () => {
    expect(hasStatus(ok(createEnvelope(200)), 201)).toBe(false)
    expect(hasStatus(ok(createEnvelope(404)), 500)).toBe(false)
  })

  it('should return false for network error', () => {
    const result = err({ code: 'NETWORK_ERROR', message: '' })
    expect(hasStatus(result, 200)).toBe(false)
  })
})

describe('matchResult', () => {
  it('should call success handler for 2xx', () => {
    const result = ok(createEnvelope(200, '{"id":1}'))
    const output = matchResult(result, {
      success: (data) => `Success: ${data.status}`,
      clientError: () => 'Client error',
      serverError: () => 'Server error',
      networkError: () => 'Network error'
    })
    expect(output).toBe('Success: 200')
  })

  it('should call clientError handler for 4xx', () => {
    const result = ok(createEnvelope(400))
    const output = matchResult(result, {
      success: () => 'Success',
      clientError: (data) => `Client error: ${data.status}`,
      serverError: () => 'Server error',
      networkError: () => 'Network error'
    })
    expect(output).toBe('Client error: 400')
  })

  it('should call serverError handler for 5xx', () => {
    const result = ok(createEnvelope(503))
    const output = matchResult(result, {
      success: () => 'Success',
      clientError: () => 'Client error',
      serverError: (data) => `Server error: ${data.status}`,
      networkError: () => 'Network error'
    })
    expect(output).toBe('Server error: 503')
  })

  it('should call networkError handler for network errors', () => {
    const result = err({ code: 'NETWORK_ERROR', message: 'Timeout' })
    const output = matchResult(result, {
      success: () => 'Success',
      clientError: () => 'Client error',
      serverError: () => 'Server error',
      networkError: (errors) => `Network error: ${errors[0]?.message}`
    })
    expect(output).toBe('Network error: Timeout')
  })

  it('should return undefined if handler not provided', () => {
    const result = ok(createEnvelope(200))
    const output = matchResult(result, {
      clientError: () => 'Client error'
    })
    expect(output).toBeUndefined()
  })

  it('should handle partial handlers', () => {
    const result = ok(createEnvelope(404))
    const output = matchResult(result, {
      clientError: () => 'Handled'
    })
    expect(output).toBe('Handled')
  })
})
