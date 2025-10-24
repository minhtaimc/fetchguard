import type {
  TokenProvider,
  RefreshTokenStorage,
  TokenParser,
  AuthStrategy,
  TokenInfo
} from '../types'
import { ok, err, type Result } from 'ts-micro-result'
import { AuthErrors, NetworkErrors } from '../errors'

/**
 * Custom auth method type
 */
type CustomAuthMethod = (...args: any[]) => Promise<Result<TokenInfo>>

/**
 * Cấu hình để tạo provider
 *
 * refreshStorage: OPTIONAL - để load refresh token lần đầu khi worker khởi động
 * - undefined: cookie-based auth (httpOnly cookie, không cần load)
 * - RefreshTokenStorage: body-based auth (load từ IndexedDB khi khởi động)
 *
 * strategy: AuthStrategy với refresh (required), login/logout (required)
 *
 * customMethods: OPTIONAL - custom auth methods (loginWithPhone, loginWithGoogle, etc.)
 */
export interface ProviderConfig {
  refreshStorage?: RefreshTokenStorage
  parser: TokenParser
  strategy: AuthStrategy
  customMethods?: Record<string, CustomAuthMethod>
}

/**
 * Factory function để tạo TokenProvider từ các thành phần modular
 *
 * Provider tự động xử lý refresh token:
 * - Nếu refreshToken null và có storage → load từ storage lần đầu
 * - Nếu refreshToken có → dùng token từ worker memory
 * - Cookie-based (không có storage) → luôn null
 *
 * Custom methods:
 * - User có thể thêm custom auth methods (loginWithPhone, loginWithGoogle, etc.)
 * - Custom methods sẽ được spread vào provider object
 */
export function createProvider(config: ProviderConfig): TokenProvider {
  const baseProvider: Pick<TokenProvider, 'refreshToken' | 'login' | 'logout'> = {
    async refreshToken(refreshToken: string | null) {
      // 1. Nếu refreshToken null và có storage → load từ storage lần đầu
      let currentRefreshToken = refreshToken
      if (currentRefreshToken === null && config.refreshStorage) {
        currentRefreshToken = await config.refreshStorage.get()
      }

      // 2. Call strategy để gọi refresh API
      try {
        const response = await config.strategy.refresh(currentRefreshToken)

        if (!response.ok) {
          return err(AuthErrors.TokenRefreshFailed({ message: `HTTP ${response.status}` }))
        }

        // 3. Parse response → trả về TokenInfo
        const tokenInfo = await config.parser.parse(response)
        if (!tokenInfo.token) {
          return err(AuthErrors.TokenRefreshFailed({ message: 'No access token in response' }))
        }

        // 4. Lưu refresh token mới vào storage (nếu có và có token mới)
        if (config.refreshStorage && tokenInfo.refreshToken) {
          await config.refreshStorage.set(tokenInfo.refreshToken)
        }

        // 5. Return TokenInfo
        return ok(tokenInfo)
      } catch (error) {
        return err(NetworkErrors.NetworkError({ message: String(error) }))
      }
    },

    async login(payload: unknown) {
      try {
        const response = await config.strategy.login(payload)

        if (!response.ok) {
          return err(AuthErrors.LoginFailed({ message: `HTTP ${response.status}` }))
        }

        const tokenInfo = await config.parser.parse(response)
        if (!tokenInfo.token) {
          return err(AuthErrors.LoginFailed({ message: 'No access token in response' }))
        }

        // Lưu refresh token vào storage (nếu có)
        if (config.refreshStorage && tokenInfo.refreshToken) {
          await config.refreshStorage.set(tokenInfo.refreshToken)
        }

        return ok(tokenInfo)
      } catch (error) {
        return err(NetworkErrors.NetworkError({ message: String(error) }))
      }
    },

    async logout(payload?: unknown) {
      try {
        const response = await config.strategy.logout(payload)

        if (!response.ok) {
          return err(AuthErrors.LogoutFailed({ message: `HTTP ${response.status}` }))
        }

        // Clear refresh token từ storage (nếu có)
        if (config.refreshStorage) {
          await config.refreshStorage.set(null)
        }

        // Return TokenInfo với tất cả fields reset
        return ok({
          token: '',
          refreshToken: undefined,
          expiresAt: undefined,
          user: undefined
        })
      } catch (error) {
        return err(NetworkErrors.NetworkError({ message: String(error) }))
      }
    }
  }

  // Merge custom methods if provided
  if (config.customMethods) {
    return {
      ...baseProvider,
      ...config.customMethods
    } as TokenProvider
  }

  return baseProvider as TokenProvider
}
