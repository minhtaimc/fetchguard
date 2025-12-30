/// <reference lib="webworker" />

import type { Result } from 'ts-micro-result'

/**
 * FetchGuard Business Types
 *
 * Contains domain logic types: Provider, Config, API Response, etc.
 * For message protocol types, see messages.ts
 */

/**
 * Token info returned from provider
 *
 * All fields are optional to support various custom auth methods:
 * - Standard login/refresh: returns token + optional fields
 * - Update user info: may only return user (no token update)
 * - Verify OTP: may return nothing (just validation)
 * - Custom auth flows: flexible field combinations
 */
export interface TokenInfo {
  token?: string | null
  expiresAt?: number | null
  refreshToken?: string | null
  user?: unknown
}

/**
 * Auth result returned from auth operations and auth state changes
 * Used by: login(), logout(), refreshToken(), onAuthStateChanged()
 */
export interface AuthResult {
  /** Whether user is authenticated (has valid non-expired token) */
  authenticated: boolean

  /** User info from token (if available) */
  user?: unknown

  /** Token expiry timestamp in milliseconds (if available) */
  expiresAt?: number | null
}

/**
 * Interface for token provider
 *
 * Provider has 3 required methods:
 * - refreshToken: Refresh access token when expired
 * - login: Login with credentials
 * - logout: Logout (clear tokens)
 *
 * User can add custom auth methods (loginWithPhone, loginWithGoogle, etc.)
 * All custom methods must return Result<TokenInfo> for token retrieval
 */
export interface TokenProvider {
  /**
   * Refresh tokens (required)
   * @param refreshToken - Current refresh token (from worker memory, null if not available)
   * @returns Result<TokenInfo> with new tokens
   */
  refreshToken(refreshToken: string | null): Promise<Result<TokenInfo>>

  /**
   * Login with credentials (required)
   * @param payload - Login credentials (email/password, etc.)
   * @param url - Optional URL override (if not provided, uses configured loginUrl)
   * @returns Result<TokenInfo> with tokens
   */
  login(payload: unknown, url?: string): Promise<Result<TokenInfo>>

  /**
   * Logout - clear tokens (required)
   * @param payload - Optional logout payload
   * @returns Result<TokenInfo> with all fields reset (token = '', refreshToken = undefined, user = undefined)
   */
  logout(payload?: unknown): Promise<Result<TokenInfo>>

  /**
   * Custom auth methods (optional)
   * Examples: loginWithPhone, loginWithGoogle, loginWithFacebook, etc.
   * All must return Result<TokenInfo> for token retrieval
   *
   * Note: Using any[] for args to allow flexible custom auth methods
   * while maintaining type compatibility with specific method signatures above
   */
  [key: string]: (...args: any[]) => Promise<Result<TokenInfo>>
}

/**
 * Interface for refresh token storage - only stores refresh token
 *
 * Access token is always stored in worker memory.
 * Refresh token storage is OPTIONAL:
 * - If available (IndexedDB): persist refresh token for reuse after reload
 * - If not (undefined): cookie-based auth (httpOnly cookie)
 */
export interface RefreshTokenStorage {
  get(): Promise<string | null>
  set(token: string | null): Promise<void>
}

/**
 * Interface for token parser - parse token from backend response
 * Parser returns complete TokenInfo (including user data)
 */
export interface TokenParser {
  parse(response: Response): Promise<TokenInfo>
}

/**
 * Interface for auth strategy - defines how to call auth APIs
 *
 * Strategy focuses only on API calls, returns Response
 * Provider handles parsing and storage
 *
 * All methods are required
 */
export interface AuthStrategy {
  /** Refresh access token */
  refresh(refreshToken: string | null): Promise<Response>

  /**
   * Login with credentials
   * @param payload - Login credentials
   * @param url - Optional URL override (if not provided, uses configured loginUrl)
   */
  login(payload: unknown, url?: string): Promise<Response>

  /** Logout */
  logout(payload?: unknown): Promise<Response>
}

/**
 * Provider preset configuration for built-in auth strategies
 */
export interface ProviderPresetConfig {
  type: 'cookie-auth' | 'body-auth'
  refreshUrl: string
  loginUrl: string
  logoutUrl: string
  refreshTokenKey?: string
  /** Custom headers to include in all auth requests (login, logout, refresh) */
  headers?: Record<string, string>
}

/**
 * Configuration for FetchGuard client
 */
export interface FetchGuardOptions {
  /**
   * Token provider - 3 options:
   * 1. TokenProvider instance (for custom providers)
   * 2. ProviderPresetConfig object (for built-in presets)
   * 3. string (for registry lookup - advanced usage)
   */
  provider: TokenProvider | ProviderPresetConfig | string

  /** List of allowed domains (wildcard supported) */
  allowedDomains?: string[]

  /** Early refresh time for tokens (ms) */
  refreshEarlyMs?: number

  /** Default headers to include in all requests */
  defaultHeaders?: Record<string, string>
}

/**
 * Internal worker configuration
 */
export interface WorkerConfig {
  allowedDomains: string[]
  refreshEarlyMs: number
  defaultHeaders: Record<string, string>
}

/**
 * Extended RequestInit with FetchGuard-specific options
 */
export interface FetchGuardRequestInit extends RequestInit {
  /** Whether this request requires authentication. Default: true */
  requiresAuth?: boolean
  /** Include response headers in result metadata and FETCH_RESULT payload */
  includeHeaders?: boolean
}

/**
 * API response structure
 * - body: string (text/JSON) or base64 (binary)
 * - contentType: always present, indicates how to decode body
 * - headers: empty object if includeHeaders: false
 * - status: HTTP status code
 */
export interface ApiResponse {
  body: string
  status: number
  contentType: string
  headers: Record<string, string>
}

/**
 * Serialized file data for transfer over postMessage
 */
export interface SerializedFile {
  name: string
  type: string
  data: number[] // ArrayBuffer as number array
}

/**
 * Serialized FormData entry - can be string or file
 */
export type SerializedFormDataEntry = string | SerializedFile

/**
 * Serialized FormData for transfer over postMessage
 */
export interface SerializedFormData {
  _type: 'FormData'
  entries: Array<[string, SerializedFormDataEntry]>
}
