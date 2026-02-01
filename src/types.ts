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
 * Options for token exchange operation
 *
 * Used when switching tenant, changing scope, or any operation
 * that exchanges current token for a new one with different claims
 */
export interface ExchangeTokenOptions {
  /** HTTP method to use. Default: 'POST' */
  method?: 'POST' | 'PUT'
  /** Payload to send with the request (e.g., tenantId, scope) */
  payload?: Record<string, unknown>
  /** Custom headers for this request. Overrides defaultHeaders if same key. */
  headers?: Record<string, string>
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
   * Exchange current token for a new one with different context
   *
   * Useful for switching tenants, changing scopes, or any operation
   * that requires exchanging the current token for a new one.
   *
   * @param accessToken - Current access token (injected by worker)
   * @param url - URL to call for token exchange
   * @param options - Exchange options (method, payload)
   * @returns Result<TokenInfo> with new tokens
   */
  exchangeToken(
    accessToken: string,
    url: string,
    options?: ExchangeTokenOptions
  ): Promise<Result<TokenInfo>>

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
 * Storage error context for debugging
 */
export type StorageErrorContext = 'get' | 'set' | 'delete' | 'open'

/**
 * Storage error callback type
 * Called when IndexedDB operations fail (quota exceeded, permission denied, etc.)
 * Storage still fails closed (returns null), but this allows logging/debugging.
 */
export type StorageErrorCallback = (error: Error, context: StorageErrorContext) => void

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

  /**
   * Exchange current token for a new one with different context
   * @param accessToken - Current access token
   * @param url - URL to call for token exchange
   * @param options - Exchange options (method, payload)
   */
  exchangeToken(accessToken: string, url: string, options?: ExchangeTokenOptions): Promise<Response>
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

  /**
   * Maximum concurrent requests to worker (default: 6)
   * Controls how many requests can be in-flight simultaneously.
   * Set to 1 for strictly sequential processing.
   * Higher values increase throughput but may cause worker congestion.
   */
  maxConcurrent?: number

  /**
   * Maximum queue size for pending requests (default: 1000)
   * When queue is full, new requests will immediately fail with QUEUE_FULL error.
   * Prevents memory leak if worker is unresponsive.
   */
  maxQueueSize?: number

  /**
   * Worker setup timeout in milliseconds (default: 10000)
   * How long to wait for worker to be ready before failing.
   */
  setupTimeout?: number

  /**
   * Default request timeout in milliseconds (default: 30000)
   * How long to wait for a request to complete before timing out.
   * Can be overridden per-request via fetch options.
   */
  requestTimeout?: number

  /**
   * Debug hooks for observing operations (logging, monitoring)
   * All hooks are observe-only - they cannot modify requests/responses.
   */
  debug?: DebugHooks

  /**
   * Retry configuration for network errors
   * Only retries on transport failures, NOT on HTTP errors (4xx/5xx)
   */
  retry?: RetryConfig

  /**
   * Request deduplication configuration
   * When enabled, duplicate requests to the same URL within a time window
   * will share the same response instead of making multiple requests.
   */
  dedupe?: DedupeConfig

  /**
   * Custom worker factory function
   *
   * Use this when you need a custom provider with parser/strategy functions.
   * Create a custom worker file that imports 'fetchguard/worker' and registers
   * your provider, then pass a factory function that creates that worker.
   *
   * @example
   * ```ts
   * // my-worker.ts
   * import 'fetchguard/worker'
   * import { registerProvider, createProvider, ... } from 'fetchguard'
   * const myProvider = createProvider({ parser: myParser, strategy: myStrategy, ... })
   * registerProvider('my-auth', myProvider)
   *
   * // main.ts
   * import MyWorker from './my-worker?worker'
   * const api = createClient({
   *   provider: 'my-auth',
   *   workerFactory: () => new MyWorker()
   * })
   * ```
   */
  workerFactory?: () => Worker
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
 * Fetch envelope - raw HTTP response from worker
 *
 * Worker only fetches and returns raw data, does NOT judge HTTP status.
 * Client receives envelope and decides ok/err based on business logic.
 *
 * - status: HTTP status code (2xx, 3xx, 4xx, 5xx)
 * - body: string (text/JSON) or base64 (binary)
 * - contentType: always present, indicates how to decode body
 * - headers: empty object if includeHeaders: false
 */
export interface FetchEnvelope {
  status: number
  body: string
  contentType: string
  headers: Record<string, string>
}


/**
 * Serialized file data for transfer over postMessage
 * Uses ArrayBuffer for zero-copy transfer via Transferable
 */
export interface SerializedFile {
  name: string
  type: string
  /** ArrayBuffer - transferred via postMessage Transferable for zero-copy */
  buffer: ArrayBuffer
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

/**
 * Result of FormData serialization with transferables
 * Used for zero-copy transfer via postMessage
 */
export interface SerializedFormDataResult {
  data: SerializedFormData
  /** ArrayBuffers to transfer - pass to postMessage as second argument */
  transferables: ArrayBuffer[]
}

/**
 * Network error detail for transport failures
 * Used when no HTTP response is received (connection failed, timeout, cancelled)
 */
export interface NetworkErrorDetail {
  code: 'NETWORK_ERROR' | 'REQUEST_CANCELLED' | 'RESPONSE_PARSE_FAILED'
  message: string
}

/**
 * Reason for token refresh
 */
export type RefreshReason = 'expired' | 'proactive' | 'manual'

/**
 * Request timing metrics for performance monitoring
 *
 * All times are in milliseconds.
 */
export interface RequestMetrics {
  /** When request was initiated (Date.now()) */
  startTime: number
  /** When response was received (Date.now()) */
  endTime: number
  /** Total duration (endTime - startTime) */
  duration: number
  /** Time spent waiting in queue before processing */
  queueTime: number
  /** Time spent in IPC (postMessage round-trip overhead) */
  ipcTime: number
}

/**
 * Debug hooks for observing FetchGuard operations
 *
 * All hooks are observe-only - they cannot modify requests/responses.
 * Useful for logging, debugging, and monitoring.
 *
 * Note: Hooks run synchronously and should not perform heavy operations.
 */
export interface DebugHooks {
  /**
   * Called before each request is sent to worker
   * @param url - Request URL
   * @param options - Request options (method, headers, etc.)
   */
  onRequest?: (url: string, options: FetchGuardRequestInit) => void

  /**
   * Called when response is received from worker
   * @param url - Request URL
   * @param envelope - Response envelope (status, body, headers)
   * @param metrics - Request timing metrics (optional, for performance monitoring)
   */
  onResponse?: (url: string, envelope: FetchEnvelope, metrics?: RequestMetrics) => void

  /**
   * Called when token refresh occurs
   * @param reason - Why refresh happened: 'expired', 'proactive', or 'manual'
   */
  onRefresh?: (reason: RefreshReason) => void

  /**
   * Called when transport error occurs (network failure, timeout, cancelled)
   * @param url - Request URL
   * @param error - Error detail with code and message
   * @param metrics - Request timing metrics (optional)
   */
  onError?: (url: string, error: NetworkErrorDetail, metrics?: RequestMetrics) => void

  /**
   * Called when worker is ready after initialization
   */
  onWorkerReady?: () => void

  /**
   * Called when worker encounters a fatal error
   * @param error - Error event from worker
   */
  onWorkerError?: (error: ErrorEvent) => void
}

/**
 * Retry configuration for network errors
 *
 * Only retries on transport failures (network error, timeout).
 * Does NOT retry on HTTP errors (4xx/5xx) - those are valid responses.
 * Does NOT retry cancelled requests.
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts (default: 0 = no retry)
   */
  maxAttempts?: number

  /**
   * Delay between retries in milliseconds (default: 1000)
   */
  delay?: number

  /**
   * Exponential backoff multiplier (default: 1 = no backoff)
   * Example: delay=1000, backoff=2 => 1s, 2s, 4s, 8s...
   */
  backoff?: number

  /**
   * Maximum delay in milliseconds (default: 30000)
   * Caps the delay when using exponential backoff
   */
  maxDelay?: number

  /**
   * Jitter factor to add randomness to retry delays (default: 0 = no jitter)
   * Range: 0 to 1 (e.g., 0.5 = ±50% randomness)
   * Helps prevent thundering herd when many clients retry simultaneously.
   *
   * Note: Jitter is only applied when shouldRetry returns true.
   * If request fails permanently, no jitter delay occurs.
   *
   * Example: delay=1000, jitter=0.5 => delay between 500ms and 1500ms
   */
  jitter?: number

  /**
   * Custom condition to determine if error should be retried
   * Default: retry on NETWORK_ERROR only
   * @param error - The error that occurred
   * @returns true to retry, false to fail immediately
   */
  shouldRetry?: (error: NetworkErrorDetail) => boolean
}

/**
 * Request deduplication configuration
 *
 * When enabled, identical GET requests (same URL) within a time window
 * will share the same in-flight request instead of making duplicates.
 *
 * IMPORTANT:
 * - Only applies to GET requests (POST/PUT/DELETE are never deduplicated)
 * - Only deduplicates in-flight requests (not caching)
 * - Safe for most read operations
 */
export interface DedupeConfig {
  /**
   * Enable deduplication (default: false)
   */
  enabled?: boolean

  /**
   * Time window in milliseconds to consider requests as duplicates (default: 0)
   * 0 = only dedupe concurrent/in-flight requests
   * >0 = also dedupe requests within this time window after completion
   */
  window?: number

  /**
   * Custom key generator for deduplication
   * Default: uses URL only for GET requests
   * @param url - Request URL
   * @param options - Request options
   * @returns Key string, or null to skip deduplication for this request
   */
  keyGenerator?: (url: string, options: FetchGuardRequestInit) => string | null
}

/**
 * Transport result - represents the outcome of a network request
 *
 * IMPORTANT: This is a TRANSPORT result, not a business result.
 * - ok = HTTP response received (check envelope.status for 2xx/4xx/5xx)
 * - err = Network failure (no response received)
 *
 * Example:
 * ```typescript
 * const result = await api.get('/users')
 * if (result.ok) {
 *   // Transport succeeded - got HTTP response
 *   if (result.data.status >= 200 && result.data.status < 400) {
 *     // Business success
 *   } else {
 *     // Business error (4xx/5xx) - still has response body
 *   }
 * } else {
 *   // Transport failed - no response (network error, timeout, cancelled)
 * }
 * ```
 */
export type TransportResult = Result<FetchEnvelope>
