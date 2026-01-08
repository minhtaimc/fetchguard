import type { TokenParser } from '../../types'
import { normalizeExpiresAt } from './normalize'

/**
 * Cookie parser - parse access token from response body
 * Expects response format: { data: { accessToken, expiresAt?, user? } }
 * Refresh token is automatically set by backend into httpOnly cookie
 */
export const cookieParser: TokenParser = {
  async parse(response) {
    const json = await response.clone().json()
    return {
      token: json.data.accessToken,
      expiresAt: normalizeExpiresAt(json.data.expiresAt),
      user: json.data.user
    }
  }
}
