import { createCookieProvider, createBodyProvider } from './presets'
import type { TokenProvider, ProviderPresetConfig } from '../types'

/**
 * Build provider from preset config
 * This is called in worker when receiving SETUP message
 */
export function buildProviderFromPreset(config: ProviderPresetConfig): TokenProvider {
  switch (config.type) {
    case 'cookie-auth':
      return createCookieProvider({
        refreshUrl: config.refreshUrl,
        loginUrl: config.loginUrl,
        logoutUrl: config.logoutUrl,
        headers: config.headers
      })

    case 'body-auth':
      return createBodyProvider({
        refreshUrl: config.refreshUrl,
        loginUrl: config.loginUrl,
        logoutUrl: config.logoutUrl,
        refreshTokenKey: config.refreshTokenKey,
        headers: config.headers
      })

    default:
      throw new Error(`Unknown provider type: ${String((config as { type?: unknown }).type)}`)
  }
}
