/**
 * Helper functions for common Result patterns
 *
 * These utilities simplify working with FetchGuard's Result-based API
 * by providing type-safe helpers for common operations.
 */

import type { Result } from 'ts-micro-result'
import type { FetchEnvelope } from './types'

/**
 * Check if result is a network/transport error (not an HTTP response)
 *
 * @example
 * const result = await api.fetch('/users')
 * if (isNetworkError(result)) {
 *   console.error('Network failed:', result.errors[0]?.message)
 * }
 */
export function isNetworkError(result: Result<FetchEnvelope>): result is Result<FetchEnvelope> & { ok: false } {
  return !result.ok
}

/**
 * Check if response is successful (2xx status)
 *
 * @example
 * if (isSuccess(result)) {
 *   const data = parseJson(result)
 * }
 */
export function isSuccess(result: Result<FetchEnvelope>): boolean {
  return result.ok && result.data.status >= 200 && result.data.status < 300
}

/**
 * Check if response is a client error (4xx status)
 *
 * @example
 * if (isClientError(result)) {
 *   console.error('Bad request:', getErrorMessage(result))
 * }
 */
export function isClientError(result: Result<FetchEnvelope>): boolean {
  return result.ok && result.data.status >= 400 && result.data.status < 500
}

/**
 * Check if response is a server error (5xx status)
 *
 * @example
 * if (isServerError(result)) {
 *   // Maybe retry?
 * }
 */
export function isServerError(result: Result<FetchEnvelope>): boolean {
  return result.ok && result.data.status >= 500
}

/**
 * Parse JSON body safely with optional type inference
 *
 * Returns null if:
 * - Result is a network error (no response)
 * - Body is not valid JSON
 *
 * @example
 * const users = parseJson<User[]>(result)
 * if (users) {
 *   // Use users array
 * }
 */
export function parseJson<T = unknown>(result: Result<FetchEnvelope>): T | null {
  if (!result.ok) return null
  try {
    return JSON.parse(result.data.body) as T
  } catch {
    return null
  }
}

/**
 * Get human-readable error message from result
 *
 * For network errors: returns the error message
 * For HTTP errors: tries to parse message from body, falls back to status code
 *
 * @example
 * if (!isSuccess(result)) {
 *   toast.error(getErrorMessage(result))
 * }
 */
export function getErrorMessage(result: Result<FetchEnvelope>): string {
  if (result.ok) {
    // HTTP error - try to parse message from body
    try {
      const body = JSON.parse(result.data.body)
      return body.message || body.error || `HTTP ${result.data.status}`
    } catch {
      return `HTTP ${result.data.status}`
    }
  }
  // Network error
  return result.errors[0]?.message || 'Unknown error'
}

/**
 * Get error body with type safety (best-effort parsing)
 *
 * NOTE: This is best-effort parsing. The error body comes from the server
 * and may not match the expected shape. Always handle null return and
 * validate before using typed properties.
 *
 * @example
 * interface ApiError {
 *   code: string
 *   message: string
 *   errors?: { field: string; message: string }[]
 * }
 *
 * const errorBody = getErrorBody<ApiError>(result)
 * if (errorBody?.errors) {
 *   errorBody.errors.forEach(e => console.error(`${e.field}: ${e.message}`))
 * }
 */
export function getErrorBody<T = unknown>(result: Result<FetchEnvelope>): T | null {
  if (!result.ok) return null
  // For HTTP errors (4xx, 5xx), try to parse the body
  if (result.data.status >= 400) {
    try {
      return JSON.parse(result.data.body) as T
    } catch {
      return null
    }
  }
  return null
}

/**
 * Get the HTTP status code from result
 *
 * Returns null if result is a network error (no HTTP response)
 *
 * @example
 * const status = getStatus(result)
 * if (status === 401) {
 *   // Redirect to login
 * }
 */
export function getStatus(result: Result<FetchEnvelope>): number | null {
  return result.ok ? result.data.status : null
}

/**
 * Check if result has a specific HTTP status
 *
 * @example
 * if (hasStatus(result, 404)) {
 *   console.log('Not found')
 * }
 */
export function hasStatus(result: Result<FetchEnvelope>, status: number): boolean {
  return result.ok && result.data.status === status
}

/**
 * Match result against multiple handlers
 *
 * @example
 * matchResult(result, {
 *   success: (data) => console.log('Success:', data),
 *   clientError: (data) => console.error('Client error:', data.status),
 *   serverError: (data) => console.error('Server error:', data.status),
 *   networkError: (errors) => console.error('Network:', errors[0]?.message)
 * })
 */
export function matchResult<T>(
  result: Result<FetchEnvelope>,
  handlers: {
    success?: (data: FetchEnvelope) => T
    clientError?: (data: FetchEnvelope) => T
    serverError?: (data: FetchEnvelope) => T
    networkError?: (errors: readonly { code: string; message: string }[]) => T
  }
): T | undefined {
  if (!result.ok) {
    return handlers.networkError?.(result.errors)
  }

  const status = result.data.status

  if (status >= 200 && status < 300) {
    return handlers.success?.(result.data)
  }

  if (status >= 400 && status < 500) {
    return handlers.clientError?.(result.data)
  }

  if (status >= 500) {
    return handlers.serverError?.(result.data)
  }

  return undefined
}
