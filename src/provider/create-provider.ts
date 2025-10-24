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
          return err(AuthErrors.TokenRefreshFailed({ message: `HTTP ${response.status}` }))
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

        if (config.refreshStorage) {
          await config.refreshStorage.set(null)
        }

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
