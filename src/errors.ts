/**
 * Error definitions organized by domain
 * Using ts-micro-result's defineError for consistency
 */

import { defineError, defineErrorAdvanced } from 'ts-micro-result'

/**
 * General errors
 */
export const GeneralErrors = {
  Unexpected: defineError('UNEXPECTED', 'Unexpected error'),
  UnknownMessage: defineError('UNKNOWN_MESSAGE', 'Unknown message type'),
  ResultParse: defineError('RESULT_PARSE_ERROR', 'Failed to parse result'),
} as const

/**
 * Initialization errors
 */
export const InitErrors = {
  NotInitialized: defineError('INIT_ERROR', 'Worker not initialized'),
  ProviderInitFailed: defineError('PROVIDER_INIT_FAILED', 'Failed to initialize provider'),
  InitFailed: defineError('INIT_FAILED', 'Initialization failed'),
} as const

/**
 * Authentication & Token errors
 */
export const AuthErrors = {
  TokenRefreshFailed: defineError('TOKEN_REFRESH_FAILED', 'Token refresh failed'),
  LoginFailed: defineError('LOGIN_FAILED', 'Login failed'),
  LogoutFailed: defineError('LOGOUT_FAILED', 'Logout failed'),
  NotAuthenticated: defineError('NOT_AUTHENTICATED', 'User is not authenticated'),
} as const

/**
 * Domain validation errors
 */
export const DomainErrors = {
  NotAllowed: defineErrorAdvanced('DOMAIN_NOT_ALLOWED', 'Domain not allowed: {url}'),
} as const

/**
 * Request/Response errors (network, HTTP, parsing)
 */
export const RequestErrors = {
  // Network errors (connection failed, no response)
  NetworkError: defineError('NETWORK_ERROR', 'Network error'),
  Cancelled: defineError('REQUEST_CANCELLED', 'Request was cancelled'),

  // HTTP errors (server responded with error status)
  HttpError: defineErrorAdvanced('HTTP_ERROR', 'HTTP {status} error'),

  // Response parsing errors
  ResponseParseFailed: defineError('RESPONSE_PARSE_FAILED', 'Failed to parse response body'),
} as const
