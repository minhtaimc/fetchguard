/**
 * Example: Multiple Login URLs
 *
 * Demonstrates how to use different login endpoints dynamically
 * by passing URL as second parameter to login()
 */

import { createClient } from '../src'

// Create client with default login URL
const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',  // Default login URL
    logoutUrl: 'https://api.example.com/auth/logout'
  }
})

// Example 1: Standard login (uses default loginUrl)
async function standardLogin() {
  const result = await api.login({
    email: 'user@example.com',
    password: 'secret123'
  })

  if (result.ok) {
    console.log('✅ Standard login successful:', result.value.user)
  }
}

// Example 2: OAuth login (override URL with second parameter)
async function oauthLogin() {
  const result = await api.login(
    {
      code: 'oauth_code_123',
      provider: 'google'
    },
    'https://api.example.com/auth/oauth'  // ← Override URL!
  )

  if (result.ok) {
    console.log('✅ OAuth login successful:', result.value.user)
  }
}

// Example 3: Phone login (override URL with second parameter)
async function phoneLogin() {
  const result = await api.login(
    {
      phone: '+84987654321',
      otp: '123456'
    },
    'https://api.example.com/auth/phone'  // ← Override URL!
  )

  if (result.ok) {
    console.log('✅ Phone login successful:', result.value.user)
  }
}

// Example 4: Custom auth method (for more complex logic)
import { createProvider } from '../src/provider/create-provider'
import { createBodyStrategy } from '../src/provider/strategy/body'
import { bodyParser } from '../src/provider/parser/body'
import { createIndexedDBStorage } from '../src/provider/storage/indexeddb'
import { ok, err } from 'ts-micro-result'
import { AuthErrors, RequestErrors } from '../src/errors'

const customProvider = createProvider({
  refreshStorage: createIndexedDBStorage('MyApp', 'refreshToken'),
  parser: bodyParser,
  strategy: createBodyStrategy({
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  }),
  customMethods: {
    // Custom method with full control
    async loginWithBiometric(biometricData: unknown) {
      try {
        const response = await fetch('https://api.example.com/auth/biometric', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(biometricData),
          credentials: 'include'
        })

        if (!response.ok) {
          return err(AuthErrors.LoginFailed({ message: `HTTP ${response.status}` }))
        }

        const tokenInfo = await bodyParser.parse(response)
        if (!tokenInfo.token) {
          return err(AuthErrors.LoginFailed({ message: 'No token' }))
        }

        // Auto-save refresh token
        const storage = createIndexedDBStorage('MyApp', 'refreshToken')
        if (tokenInfo.refreshToken) {
          await storage.set(tokenInfo.refreshToken)
        }

        return ok(tokenInfo)
      } catch (error) {
        return err(RequestErrors.NetworkError({ message: String(error) }))
      }
    }
  }
})

// Usage with custom method
async function biometricLogin() {
  const apiWithCustom = createClient({
    provider: customProvider
  })

  const result = await apiWithCustom.call('loginWithBiometric', true, {
    fingerprint: 'abc123'
  })

  if (result.ok) {
    console.log('✅ Biometric login successful:', result.value.user)
  }
}

// Run examples
async function main() {
  console.log('🔐 Multiple Login URLs Example\n')

  await standardLogin()
  await oauthLogin()
  await phoneLogin()
  await biometricLogin()

  console.log('\n✨ All examples completed!')
}

main().catch(console.error)
