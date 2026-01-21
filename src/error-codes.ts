/**
 * Error codes as constants for type-safe error matching
 *
 * Usage:
 * ```typescript
 * import { ERROR_CODES } from 'fetchguard'
 *
 * if (result.errors[0]?.code === ERROR_CODES.NETWORK_ERROR) {
 *   // Handle network error
 * }
 * ```
 */

export const ERROR_CODES = {
  // General
  UNEXPECTED: 'UNEXPECTED',
  UNKNOWN_MESSAGE: 'UNKNOWN_MESSAGE',
  RESULT_PARSE_ERROR: 'RESULT_PARSE_ERROR',

  // Init
  INIT_ERROR: 'INIT_ERROR',
  PROVIDER_INIT_FAILED: 'PROVIDER_INIT_FAILED',
  INIT_FAILED: 'INIT_FAILED',

  // Auth
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  TOKEN_EXCHANGE_FAILED: 'TOKEN_EXCHANGE_FAILED',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT_FAILED: 'LOGOUT_FAILED',
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',

  // Domain
  DOMAIN_NOT_ALLOWED: 'DOMAIN_NOT_ALLOWED',

  // Request
  NETWORK_ERROR: 'NETWORK_ERROR',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  HTTP_ERROR: 'HTTP_ERROR',
  RESPONSE_PARSE_FAILED: 'RESPONSE_PARSE_FAILED',
  QUEUE_FULL: 'QUEUE_FULL',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT'
} as const

/**
 * Union type of all error code values
 */
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

/**
 * Union type of all error code keys (useful for telemetry mapping)
 */
export type ErrorCodeKey = keyof typeof ERROR_CODES
