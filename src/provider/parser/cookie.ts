import type { TokenParser } from '../../types'

/**
 * Cookie parser - parse access token từ response body
 * Expects response format: { data: { accessToken, expiresAt?, user? } }
 * Refresh token được BE tự động set vào httpOnly cookie
 */
export const cookieParser: TokenParser = {
  async parse(response) {
    const json = await response.clone().json()
    return {
      token: json.data.accessToken,
      expiresAt: json.data.expiresAt,
      user: json.data.user
      // refreshToken không trả về vì là httpOnly cookie
    }
  }
}
