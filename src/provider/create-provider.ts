import type {
  TokenProvider,
  RefreshTokenStorage,
  TokenParser,
  AuthStrategy,
  TokenInfo
} from '../types'
import { ok, err, type Result } from 'ts-micro-result'
import { AuthErrors, RequestErrors } from '../errors'

/**
 * Custom auth method type
 */
type CustomAuthMethod = (...args: unknown[]) => Promise<Result<TokenInfo>>

/**
 * Configuration for creating provider
 *
 * refreshStorage: OPTIONAL - to load refresh token initially when worker starts
 * - undefined: cookie-based auth (httpOnly cookie, no need to load)
 * - RefreshTokenStorage: body-based auth (load from IndexedDB on startup)
 *
 * strategy: AuthStrategy with refresh (required), login/logout (required)
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
 * Factory function to create TokenProvider from modular components
 *
 * Provider automatically handles refresh token:
 * - If refreshToken is null and storage exists → load from storage initially
 * - If refreshToken exists → use token from worker memory
 * - Cookie-based (no storage) → always null
 *
 * Custom methods:
 * - User can add custom auth methods (loginWithPhone, loginWithGoogle, etc.)
 * - Custom methods will be spread into provider object
 */
export function createProvider(config: ProviderConfig): TokenProvider {
  const baseProvider: Pick<TokenProvider, 'refreshToken' | 'login' | 'logout'> = {
    async refreshToken(refreshToken: string | null) {
      let currentRefreshToken = refreshToken
      if (currentRefreshToken === null && config.refreshStorage) {
        currentRefreshToken = await config.refreshStorage.get()
      }

      try {
        const response = await config.strategy.refresh(currentRefreshToken)

        if (!response.ok) {
          // Read response body for error details
          const body = await response.text().catch(() => '')
          return err(AuthErrors.TokenRefreshFailed(), { body }, response.status)
        }

        const tokenInfo = await config.parser.parse(response)
        if (!tokenInfo.token) {
          return err(AuthErrors.TokenRefreshFailed({ message: 'No access token in response' }))
        }

        if (config.refreshStorage && tokenInfo.refreshToken) {
          await config.refreshStorage.set(tokenInfo.refreshToken)
        }

        return ok(tokenInfo)
      } catch (error) {
        return err(RequestErrors.NetworkError({ message: String(error) }))
      }
    },

    async login(payload: unknown, url?: string) {
      try {
        const response = await config.strategy.login(payload, url)

        if (!response.ok) {
          // Read response body for error details
          const body = await response.text().catch(() => '')
          return err(AuthErrors.LoginFailed(), { body }, response.status)
        }

        const tokenInfo = await config.parser.parse(response)
        if (!tokenInfo.token) {
          return err(AuthErrors.LoginFailed({ message: 'No access token in response' }))
        }

        if (config.refreshStorage && tokenInfo.refreshToken) {
          await config.refreshStorage.set(tokenInfo.refreshToken)
        }

        return ok(tokenInfo)
      } catch (error) {
        return err(RequestErrors.NetworkError({ message: String(error) }))
      }
    },

    async logout(payload?: unknown) {
      try {
        const response = await config.strategy.logout(payload)

        if (!response.ok) {
          // Read response body for error details
          const body = await response.text().catch(() => '')
          return err(AuthErrors.LogoutFailed(), { body }, response.status)
        }

        if (config.refreshStorage) {
          await config.refreshStorage.set(null)
        }

        return ok({
          token: '',
          refreshToken: undefined,
          expiresAt: undefined,
          user: null  // Explicitly clear user on logout
        })
      } catch (error) {
        return err(RequestErrors.NetworkError({ message: String(error) }))
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
