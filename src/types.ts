/// <reference lib="webworker" />

import type { Result } from 'ts-micro-result'

/**
 * FetchGuard Business Types
 *
 * Contains domain logic types: Provider, Config, API Response, etc.
 * For message protocol types, see messages.ts
 */

/**
 * Token info trả về từ provider
 */
export interface TokenInfo {
  token: string
  expiresAt?: number
  refreshToken?: string
  user?: unknown
}

/**
 * Interface cho token provider
 *
 * Provider có 3 methods bắt buộc:
 * - refreshToken: Refresh access token khi expired
 * - login: Đăng nhập với credentials
 * - logout: Đăng xuất (clear tokens)
 *
 * User có thể thêm custom auth methods (loginWithPhone, loginWithGoogle, etc.)
 * Tất cả custom methods phải return Result<TokenInfo> vì mục đích là lấy tokens
 */
export interface TokenProvider {
  /**
   * Refresh tokens (required)
   * @param refreshToken - Current refresh token (from worker memory, null nếu chưa có)
   * @returns Result<TokenInfo> with new tokens
   */
  refreshToken(refreshToken: string | null): Promise<Result<TokenInfo>>

  /**
   * Login với credentials (required)
   * @param payload - Login credentials (email/password, etc.)
   * @returns Result<TokenInfo> with tokens
   */
  login(payload: unknown): Promise<Result<TokenInfo>>

  /**
   * Logout - clear tokens (required)
   * @param payload - Optional logout payload
   * @returns Result<TokenInfo> với tất cả fields reset (token = '', refreshToken = undefined, user = undefined)
   */
  logout(payload?: unknown): Promise<Result<TokenInfo>>

  /**
   * Custom auth methods (optional)
   * Ví dụ: loginWithPhone, loginWithGoogle, loginWithFacebook, etc.
   * Tất cả phải return Result<TokenInfo> vì mục đích là lấy tokens
   */
  [key: string]: (...args: any[]) => Promise<Result<TokenInfo>>
}

/**
 * Interface cho refresh token storage - chỉ lưu refresh token
 *
 * Access token luôn lưu trong worker memory.
 * Refresh token storage là OPTIONAL:
 * - Nếu có (IndexedDB): persist refresh token để dùng lại sau khi reload
 * - Nếu không (undefined): cookie-based auth (httpOnly cookie)
 */
export interface RefreshTokenStorage {
  get(): Promise<string | null>
  set(token: string | null): Promise<void>
}

/**
 * Interface cho token parser - parse token từ response của BE
 * Parser trả về đầy đủ TokenInfo (bao gồm user data)
 */
export interface TokenParser {
  parse(response: Response): Promise<TokenInfo>
}

/**
 * Interface cho auth strategy - định nghĩa cách call auth APIs
 *
 * Strategy chỉ focus vào việc gọi API, trả về Response
 * Provider sẽ xử lý parsing và storage
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
 * Cấu hình cho FetchGuard client
 */
export interface FetchGuardOptions {
  /** Base URL cho API requests */
  baseUrl?: string

  /** Token provider instance hoặc tên provider đã đăng ký */
  provider: TokenProvider | string

  /** Danh sách domain được phép (wildcard supported) */
  allowedDomains?: string[]

  /** Debug mode */
  debug?: boolean

  /** Thời gian refresh token sớm (ms) */
  refreshEarlyMs?: number

  /** Timeout mặc định cho requests (ms) */
  defaultTimeoutMs?: number

  /** Số lần retry mặc định */
  retryCount?: number

  /** Delay giữa các lần retry (ms) */
  retryDelayMs?: number
}

/**
 * Cấu hình worker internal
 */
export interface WorkerConfig {
  baseUrl: string
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

// Legacy error classes removed; use grouped errors in errors.ts instead

