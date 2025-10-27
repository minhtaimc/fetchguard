/**
 * Error definitions organized by domain
 * Using ts-micro-result's defineError for consistency
 */

import { defineError, defineErrorAdvanced } from 'ts-micro-result'

/**
 * General errors
 */
export const GeneralErrors = {
  Unexpected: defineError('UNEXPECTED', 'Unexpected error', 500),
  UnknownMessage: defineError('UNKNOWN_MESSAGE', 'Unknown message type', 400),
  ResultParse: defineError('RESULT_PARSE_ERROR', 'Failed to parse result', 500),
} as const

/**
 * Initialization errors
 */
export const InitErrors = {
  NotInitialized: defineError('INIT_ERROR', 'Worker not initialized', 500),
  ProviderInitFailed: defineError('PROVIDER_INIT_FAILED', 'Failed to initialize provider', 500),
  InitFailed: defineError('INIT_FAILED', 'Initialization failed', 500),
} as const

/**
 * Authentication & Token errors
 */
export const AuthErrors = {
  TokenRefreshFailed: defineError('TOKEN_REFRESH_FAILED', 'Token refresh failed', 401),
  LoginFailed: defineError('LOGIN_FAILED', 'Login failed', 401),
  LogoutFailed: defineError('LOGOUT_FAILED', 'Logout failed', 500),
  NotAuthenticated: defineError('NOT_AUTHENTICATED', 'User is not authenticated', 401),
} as const

/**
 * Domain validation errors
 */
export const DomainErrors = {
  NotAllowed: defineErrorAdvanced('DOMAIN_NOT_ALLOWED', 'Domain not allowed: {url}', 403),
} as const

/**
 * Request/Response errors (network, HTTP, parsing)
 */
export const RequestErrors = {
  // Network errors (connection failed, no response)
  NetworkError: defineError('NETWORK_ERROR', 'Network error', 500),
  Cancelled: defineError('REQUEST_CANCELLED', 'Request was cancelled', 499),

  // HTTP errors (server responded with error status)
  HttpError: defineErrorAdvanced('HTTP_ERROR', 'HTTP {status} error', 500),

  // Response parsing errors
  ResponseParseFailed: defineError('RESPONSE_PARSE_FAILED', 'Failed to parse response body', 500),
} as const
