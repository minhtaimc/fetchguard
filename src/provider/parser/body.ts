import type { TokenParser } from '../../types'

/**
 * Body parser - parse token từ response body (JSON)
 * Expects response format: { data: { accessToken, refreshToken, expiresAt?, user? } }
 */
export const bodyParser: TokenParser = {
  async parse(response) {
    const json = await response.clone().json()
    return {
      token: json.data.accessToken,
      refreshToken: json.data.refreshToken,
      expiresAt: json.data.expiresAt,
      user: json.data.user
    }
  }
}
