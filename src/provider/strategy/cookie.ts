import type { AuthStrategy } from '../../types'

/**
 * Cookie auth strategy - all auth operations via httpOnly cookies
 * Suitable for SSR and cross-domain authentication
 *
 * Refresh token is sent automatically via httpOnly cookie
 * Credentials are sent in request body
 *
 * Login URL can be:
 * - Configured once: loginUrl: 'https://api.example.com/auth/login'
 * - Passed per call: login(payload, 'https://...')
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
        credentials: 'include'
      })
    },

    async login(payload, url) {
      return fetch(url || config.loginUrl, {
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
