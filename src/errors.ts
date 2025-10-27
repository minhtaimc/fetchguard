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
 * Network errors (connection failures, no response)
 */
export const NetworkErrors = {
  NetworkError: defineError('NETWORK_ERROR', 'Network error', 500),
  FetchError: defineError('FETCH_ERROR', 'Fetch error', 500),
} as const

/**
 * HTTP errors (server returned error status 4xx/5xx)
 */
export const HttpErrors = {
  ClientError: defineError('HTTP_CLIENT_ERROR', 'HTTP client error (4xx)', 400),
  ServerError: defineError('HTTP_SERVER_ERROR', 'HTTP server error (5xx)', 500),
  BadRequest: defineError('HTTP_BAD_REQUEST', 'Bad request', 400),
  Unauthorized: defineError('HTTP_UNAUTHORIZED', 'Unauthorized', 401),
  Forbidden: defineError('HTTP_FORBIDDEN', 'Forbidden', 403),
  NotFound: defineError('HTTP_NOT_FOUND', 'Not found', 404),
  InternalServerError: defineError('HTTP_INTERNAL_SERVER_ERROR', 'Internal server error', 500),
} as const

/**
 * Request errors
 */
export const RequestErrors = {
  Cancelled: defineError('REQUEST_CANCELLED', 'Request was cancelled', 499),
  Timeout: defineError('REQUEST_TIMEOUT', 'Request timeout', 408),
  ResponseParseFailed: defineError('RESPONSE_PARSE_FAILED', 'Failed to parse response body', 500),
} as const
