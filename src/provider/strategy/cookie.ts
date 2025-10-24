import type { AuthStrategy } from '../../types'

/**
 * Cookie auth strategy - all auth operations via httpOnly cookies
 * Phù hợp cho SSR và cross-domain authentication
 *
 * Refresh token được gửi tự động qua httpOnly cookie
 * Credentials được gửi trong request body
 */
export function createCookieStrategy(config: {
  refreshUrl: string
  loginUrl: string
  logoutUrl: string
}): AuthStrategy {
  return {
    async refresh() {
      return fetch(config.refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include' // Quan trọng: gửi httpOnly cookies
      })
    },

    async login(payload) {
      return fetch(config.loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      })
    },

    async logout(payload) {
      return fetch(config.logoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
        credentials: 'include'
      })
    }
  }
}

/**
 * Standard cookie strategy
 */
export const cookieStrategy = createCookieStrategy({
  refreshUrl: '/auth/refresh',
  loginUrl: '/auth/login',
  logoutUrl: '/auth/logout'
})
