import { describe, it, expect } from 'vitest'
import { bodyParser } from '../src/provider/parser/body'
import { cookieParser } from '../src/provider/parser/cookie'

const makeBodyResponse = (data: unknown): Response =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })

describe('token parsers', () => {
  it('extracts tokens from body parser responses', async () => {
    const response = makeBodyResponse({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 123,
      user: { id: 'u1' }
    })

    const result = await bodyParser.parse(response)
    expect(result).toEqual({
      token: 'access',
      refreshToken: 'refresh',
      expiresAt: 123,
      user: { id: 'u1' }
    })
  })

  it('extracts tokens from cookie parser responses', async () => {
    const response = makeBodyResponse({
      accessToken: 'cookie-token',
      expiresAt: null,
      user: { email: 'user@example.com' }
    })

    const result = await cookieParser.parse(response)
    expect(result).toEqual({
      token: 'cookie-token',
      expiresAt: null,
      user: { email: 'user@example.com' }
    })
  })
})
