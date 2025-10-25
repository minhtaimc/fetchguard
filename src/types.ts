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
   * @returns Result<TokenInfo> with tokens
   */
  login(payload: unknown): Promise<Result<TokenInfo>>

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

  /** Login with credentials */
  login(payload: unknown): Promise<Response>

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

  /** Debug mode */
  debug?: boolean

  /** Early refresh time for tokens (ms) */
  refreshEarlyMs?: number

  /** Default timeout for requests (ms) */
  defaultTimeoutMs?: number

  /** Default retry count */
  retryCount?: number

  /** Delay between retries (ms) */
  retryDelayMs?: number
}

/**
 * Internal worker configuration
 */
export interface WorkerConfig {
  allowedDomains: string[]
  debug: boolean
  refreshEarlyMs: number
  defaultTimeoutMs: number
  retryCount: number
  retryDelayMs: number
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
 * API response wrapper
 */
export interface ApiResponse<T = unknown> {
  data: T
  status: number
  headers: Record<string, string>
}
