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
        logoutUrl: config.logoutUrl
      })

    case 'body-auth':
      return createBodyProvider({
        refreshUrl: config.refreshUrl,
        loginUrl: config.loginUrl,
        logoutUrl: config.logoutUrl,
        refreshTokenKey: config.refreshTokenKey
      })

    default:
      throw new Error(`Unknown provider type: ${(config as any).type}`)
  }
}
