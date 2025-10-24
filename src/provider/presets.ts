import { createProvider } from './create-provider'
import { createIndexedDBStorage } from './storage/indexeddb'
import { bodyParser } from './parser/body'
import { cookieParser } from './parser/cookie'
import { createCookieStrategy } from './strategy/cookie'
import { createBodyStrategy } from './strategy/body'
import type { TokenProvider } from '../types'

/**
 * Cookie Provider - uses httpOnly cookies
 * Suitable for SSR and cross-domain authentication
 *
 * Access token: Worker memory
 * Refresh token: httpOnly cookie (managed by backend)
 */
export function createCookieProvider(config: {
  refreshUrl: string
  loginUrl: string
  logoutUrl: string
}): TokenProvider {
  return createProvider({
    refreshStorage: undefined,
    parser: cookieParser,
    strategy: createCookieStrategy(config)
  })
}

/**
 * Body Provider - refresh token in response body, persisted to IndexedDB
 * Suitable for SPA applications
 *
 * Access token: Worker memory
 * Refresh token: IndexedDB (persists across reload)
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
