/**
 * Error definitions organized by domain
 * Using ts-micro-result's defineError for consistency
 */

import { defineError, defineErrorAdvanced } from 'ts-micro-result'
import { ERROR_CODES } from './error-codes'

/**
 * General errors
 */
export const GeneralErrors = {
  Unexpected: defineError(ERROR_CODES.UNEXPECTED, 'Unexpected error'),
  UnknownMessage: defineError(ERROR_CODES.UNKNOWN_MESSAGE, 'Unknown message type'),
  ResultParse: defineError(ERROR_CODES.RESULT_PARSE_ERROR, 'Failed to parse result'),
} as const

/**
 * Initialization errors
 */
export const InitErrors = {
  NotInitialized: defineError(ERROR_CODES.INIT_ERROR, 'Worker not initialized'),
  ProviderInitFailed: defineError(ERROR_CODES.PROVIDER_INIT_FAILED, 'Failed to initialize provider'),
  InitFailed: defineError(ERROR_CODES.INIT_FAILED, 'Initialization failed'),
} as const

/**
 * Authentication & Token errors
 */
export const AuthErrors = {
  TokenRefreshFailed: defineError(ERROR_CODES.TOKEN_REFRESH_FAILED, 'Token refresh failed'),
  LoginFailed: defineError(ERROR_CODES.LOGIN_FAILED, 'Login failed'),
  LogoutFailed: defineError(ERROR_CODES.LOGOUT_FAILED, 'Logout failed'),
  NotAuthenticated: defineError(ERROR_CODES.NOT_AUTHENTICATED, 'User is not authenticated'),
} as const

/**
 * Domain validation errors
 */
export const DomainErrors = {
  NotAllowed: defineErrorAdvanced(ERROR_CODES.DOMAIN_NOT_ALLOWED, 'Domain not allowed: {url}'),
} as const

/**
 * Request/Response errors (network, HTTP, parsing)
 */
export const RequestErrors = {
  // Network errors (connection failed, no response)
  NetworkError: defineError(ERROR_CODES.NETWORK_ERROR, 'Network error'),
  Cancelled: defineError(ERROR_CODES.REQUEST_CANCELLED, 'Request was cancelled'),

  // HTTP errors (server responded with error status)
  HttpError: defineErrorAdvanced(ERROR_CODES.HTTP_ERROR, 'HTTP {status} error'),

  // Response parsing errors
  ResponseParseFailed: defineError(ERROR_CODES.RESPONSE_PARSE_FAILED, 'Failed to parse response body'),

  // Queue errors
  QueueFull: defineErrorAdvanced(ERROR_CODES.QUEUE_FULL, 'Request queue full ({size}/{maxSize})'),

  // Timeout errors
  Timeout: defineError(ERROR_CODES.REQUEST_TIMEOUT, 'Request timed out'),
} as const
