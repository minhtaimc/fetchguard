import { createProvider } from './create-provider'
import { createIndexedDBStorage } from './storage/indexeddb'
import { bodyParser } from './parser/body'
import { cookieParser } from './parser/cookie'
import { createCookieStrategy } from './strategy/cookie'
import { createBodyStrategy } from './strategy/body'
import type { TokenProvider } from '../types'

/**
 * Cookie Provider - sử dụng httpOnly cookies
 * Phù hợp cho SSR và cross-domain authentication
 *
 * Access token: Worker memory
 * Refresh token: httpOnly cookie (BE quản lý)
 */
export function createCookieProvider(config: {
  refreshUrl: string
  loginUrl: string
  logoutUrl: string
}): TokenProvider {
  return createProvider({
    refreshStorage: undefined, // Không cần storage - cookie-based
    parser: cookieParser,
    strategy: createCookieStrategy(config)
  })
}

/**
 * Body Provider - refresh token trong response body, persist vào IndexedDB
 * Phù hợp cho SPA applications
 *
 * Access token: Worker memory
 * Refresh token: IndexedDB (persist qua reload)
 */
export function createBodyProvider(config: {
  refreshUrl: string
  loginUrl: string
  logoutUrl: string
  refreshTokenKey?: string
}): TokenProvider {
  return createProvider({
    refreshStorage: createIndexedDBStorage('FetchGuardDB', config.refreshTokenKey || 'refreshToken'),
    parser: bodyParser,
    strategy: createBodyStrategy(config)
  })
}
