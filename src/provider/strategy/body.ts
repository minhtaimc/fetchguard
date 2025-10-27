import type { AuthStrategy } from '../../types'

/**
 * Body auth strategy - all auth operations via request body
 * Suitable for SPA applications
 *
 * All tokens/credentials are sent in request body
 *
 * Login URL can be:
 * - Configured once: loginUrl: 'https://api.example.com/auth/login'
 * - Passed per call: login(payload, 'https://...')
 */
export function createBodyStrategy(config: {
  refreshUrl: string
  loginUrl: string
  logoutUrl: string
}): AuthStrategy {
  return {
    async refresh(refreshToken) {
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }

      return fetch(config.refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
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
 * Standard body strategy
 */
export const bodyStrategy = createBodyStrategy({
  refreshUrl: '/auth/refresh',
  loginUrl: '/auth/login',
  logoutUrl: '/auth/logout'
})
