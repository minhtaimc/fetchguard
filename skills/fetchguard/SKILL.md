---
name: fetchguard
description: FetchGuard v2.1.1 usage guide. Use when implementing secure API calls with Web Worker token isolation, handling auth flows (login/logout/refresh/exchange), or working with Result-based responses.
---

# FetchGuard v2.1.1

Secure API proxy that isolates tokens in Web Worker IIFE closure. Protects against XSS token theft.

## Installation

```bash
npm install fetchguard ts-micro-result
```

**Vite config required:**
```ts
// vite.config.ts
export default defineConfig({
  optimizeDeps: { exclude: ['fetchguard'] }
})
```

## Quick Start

```ts
import { createClient } from 'fetchguard'

const api = createClient({
  provider: {
    type: 'body-auth',  // or 'cookie-auth'
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  },
  allowedDomains: ['api.example.com']
})

// Wait for worker ready
await api.whenReady()
```

## Response Handling (v2.0 Pattern)

Worker returns `ok(FetchEnvelope)` for ALL HTTP responses. Only network failures return `err()`.

```ts
import { isSuccess, isClientError, parseJson, ERROR_CODES } from 'fetchguard'

const result = await api.get('https://api.example.com/users')

// Option 1: Helper functions (recommended)
if (isSuccess(result)) {
  const users = parseJson<User[]>(result)
  console.log(users)
} else if (isClientError(result)) {
  console.log('Client error:', result.data.status)
} else if (!result.ok) {
  console.log('Network error:', result.errors[0].message)
}

// Option 2: Manual status check
if (result.ok) {
  const envelope = result.data
  if (envelope.status >= 200 && envelope.status < 400) {
    const data = JSON.parse(envelope.body)
  } else {
    // HTTP 4xx/5xx - still have response body
    console.log('HTTP error:', envelope.status, envelope.body)
  }
} else {
  // Network error only
  if (result.errors[0]?.code === ERROR_CODES.NETWORK_ERROR) {
    console.log('Connection failed')
  }
}
```

## FetchEnvelope Structure

```ts
interface FetchEnvelope {
  status: number        // HTTP status (2xx-5xx)
  body: string          // Text/JSON or base64 (binary)
  contentType: string   // e.g., 'application/json'
  headers: Record<string, string>  // if includeHeaders: true
}
```

## HTTP Methods

```ts
// All return Promise<Result<FetchEnvelope>>
await api.get(url, options?)
await api.post(url, body?, options?)
await api.put(url, body?, options?)
await api.patch(url, body?, options?)
await api.delete(url, options?)
await api.fetch(url, options?)  // Generic
```

## Request Options

```ts
interface FetchGuardRequestInit extends RequestInit {
  requiresAuth?: boolean    // default: true
  includeHeaders?: boolean  // default: false
  signal?: AbortSignal      // for cancellation
}

// Public endpoint (no auth header)
await api.get('/public/config', { requiresAuth: false })

// Include response headers
const result = await api.get('/users', { includeHeaders: true })
if (result.ok) {
  console.log(result.data.headers['x-total-count'])
}
```

## Authentication

### Login

```ts
const result = await api.login({ email: 'user@example.com', password: 'secret' })

if (result.ok) {
  const { authenticated, user, expiresAt } = result.data
  console.log('Logged in:', user)
} else {
  // Login failed - check meta.params for details
  const params = result.meta?.params as { status?: number; body?: string }
  console.log('Failed:', params?.status, params?.body)
}
```

### Multiple Login URLs

```ts
// Default URL
await api.login({ email, password })

// OAuth URL
await api.login(
  { code: 'oauth_123', provider: 'google' },
  'https://api.example.com/auth/oauth'
)

// Phone auth URL
await api.login(
  { phone: '+1234567890', otp: '123456' },
  'https://api.example.com/auth/phone'
)
```

### Logout

```ts
await api.logout()
```

### Manual Refresh

```ts
const result = await api.refreshToken()
if (result.ok) {
  console.log('Token refreshed, expires:', result.data.expiresAt)
}
```

### Token Exchange (Tenant Switch, Scope Change)

```ts
// Switch tenant
const result = await api.exchangeToken('https://auth.example.com/auth/select-tenant', {
  payload: { tenantId: 'tenant_123' }
})

// Change scope with PUT method
const result = await api.exchangeToken('https://auth.example.com/auth/switch-context', {
  method: 'PUT',
  payload: { scope: 'admin' }
})

// Silent (no AUTH_STATE_CHANGED event)
const result = await api.exchangeToken(url, options, false)

if (result.ok) {
  const { authenticated, user, expiresAt } = result.data
  console.log('New context:', user)
}
```

### Auth State Subscription

```ts
const unsubscribe = api.onAuthStateChanged(({ authenticated, user, expiresAt }) => {
  if (authenticated) {
    console.log('User:', user, 'Expires:', new Date(expiresAt!))
  } else {
    console.log('Logged out')
  }
})

// Cleanup
unsubscribe()
```

## Cancellation

### AbortSignal (recommended)

```ts
const controller = new AbortController()

// Cancel after 5s
setTimeout(() => controller.abort(), 5000)

const result = await api.fetch('/slow', { signal: controller.signal })

if (!result.ok && result.errors[0]?.code === ERROR_CODES.REQUEST_CANCELLED) {
  console.log('Request cancelled')
}
```

### Manual Cancel

```ts
const { id, result, cancel } = api.fetchWithId('/slow')

// Later...
cancel()

const res = await result  // Will be cancelled error
```

## Helper Functions

```ts
import {
  isSuccess,        // Check if 2xx
  isClientError,    // Check if 4xx
  isServerError,    // Check if 5xx
  isNetworkError,   // Check if network error (no response)
  parseJson,        // Safe JSON parsing with type inference
  getErrorMessage,  // Extract error message
  getErrorBody,     // Get typed error body from HTTP errors
  getStatus,        // Get HTTP status or null
  hasStatus,        // Check specific status
  matchResult,      // Pattern matching
  ERROR_CODES       // Type-safe error codes
} from 'fetchguard'

// Pattern matching
const message = matchResult(result, {
  success: (envelope) => `Success: ${envelope.status}`,
  clientError: (envelope) => `Client error: ${envelope.status}`,
  serverError: (envelope) => `Server error: ${envelope.status}`,
  networkError: (errors) => `Network: ${errors[0]?.message}`
})
```

## Error Codes

```ts
import { ERROR_CODES } from 'fetchguard'

// Network errors
ERROR_CODES.NETWORK_ERROR      // Connection failed
ERROR_CODES.REQUEST_CANCELLED  // Cancelled via AbortSignal or cancel()
ERROR_CODES.REQUEST_TIMEOUT    // Request timed out

// Auth errors
ERROR_CODES.LOGIN_FAILED
ERROR_CODES.LOGOUT_FAILED
ERROR_CODES.TOKEN_REFRESH_FAILED
ERROR_CODES.TOKEN_EXCHANGE_FAILED
ERROR_CODES.NOT_AUTHENTICATED

// Other
ERROR_CODES.DOMAIN_NOT_ALLOWED
ERROR_CODES.QUEUE_FULL
ERROR_CODES.INIT_ERROR
```

## FormData / File Upload

```ts
const formData = new FormData()
formData.append('file', file)
formData.append('name', 'document.pdf')

const result = await api.post('https://api.example.com/upload', formData)
```

## Binary Responses

```ts
import { isBinaryContentType, base64ToArrayBuffer } from 'fetchguard'

const result = await api.get('/image.png')

if (result.ok && isBinaryContentType(result.data.contentType)) {
  const buffer = base64ToArrayBuffer(result.data.body)
  const blob = new Blob([buffer], { type: result.data.contentType })
  const url = URL.createObjectURL(blob)
}
```

## Configuration Options

```ts
const api = createClient({
  // Required
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout',
    headers: { 'X-Client': 'web' }  // Auth request headers
  },

  // Optional
  allowedDomains: ['api.example.com', '*.cdn.example.com'],
  refreshEarlyMs: 60000,      // Refresh 60s before expiry (default)
  maxConcurrent: 6,           // Max concurrent requests (default)
  maxQueueSize: 1000,         // Max queue size (default)
  setupTimeout: 10000,        // Worker init timeout (default)
  requestTimeout: 30000,      // Default request timeout (default)

  defaultHeaders: {           // Headers for ALL requests
    'X-Client-Version': '1.0.0'
  },

  // Retry config
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoff: 2,
    maxDelay: 30000,
    jitter: 0.1,  // ±10% randomization
    shouldRetry: (error) => error.code === 'NETWORK_ERROR'
  },

  // Deduplication
  dedupe: {
    enabled: true,
    methods: ['GET'],
    ttl: 0
  },

  // Debug hooks
  debug: {
    onRequest: (url, options) => console.log('Request:', url),
    onResponse: (url, envelope, metrics) => {
      console.log(`${url}: ${metrics.duration}ms`)
    },
    onError: (url, error, metrics) => console.log('Error:', error),
    onRefresh: (reason) => console.log('Token refresh:', reason),
    onWorkerReady: () => console.log('Worker ready'),
    onWorkerError: (event) => console.log('Worker error:', event)
  }
})
```

## React Integration

```tsx
import { createClient, isSuccess, parseJson } from 'fetchguard'
import { useQuery } from '@tanstack/react-query'

const api = createClient({ /* ... */ })

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const result = await api.get('https://api.example.com/users')
      if (isSuccess(result)) {
        return parseJson<User[]>(result)
      }
      throw new Error(result.ok ? `HTTP ${result.data.status}` : result.errors[0].message)
    }
  })
}
```

## Cleanup

```ts
// Terminate worker and cleanup
api.destroy()
```

## Custom Provider (Advanced)

```ts
import { createProvider, createIndexedDBStorage, bodyParser, registerProvider } from 'fetchguard'

const myProvider = createProvider({
  refreshStorage: createIndexedDBStorage('MyApp', 'refreshToken'),
  parser: bodyParser,
  strategy: {
    async refresh(refreshToken) {
      return fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })
    },
    async login(payload, url) {
      return fetch(url || '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    },
    async logout(payload) {
      return fetch('/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      })
    }
  }
})

// Register for reuse
registerProvider('my-auth', myProvider)

// Use registered provider
const api = createClient({ provider: 'my-auth' })
```

## Custom Auth Methods

```ts
// Call custom provider methods
await api.call('loginWithOTP', true, { phone: '+1234567890', code: '123456' })
await api.call('loginWithGoogle', false, { token: 'google_token' })  // Silent (no event)
```

## Worker Ready State

```ts
// Check if ready (sync)
if (api.ready()) {
  console.log('Worker ready')
}

// Wait for ready (async)
await api.whenReady()

// Subscribe to ready event
const unsubscribe = api.onReady(() => {
  console.log('Worker is ready')
})
```

## ApiService Wrapper Pattern

When backend returns `Result<T>` format (`{ ok, data, errors, meta }`), create an ApiService layer:

```ts
import { createClient, ERROR_CODES } from 'fetchguard'
import type { FetchEnvelope } from 'fetchguard'
import { ok, err, type Result, type ErrorDetail } from 'ts-micro-result'

// Transform FetchEnvelope to Result<T>
function transformResponse<T>(result: Result<FetchEnvelope>): Result<T> {
  // Network error
  if (!result.ok) {
    const code = result.errors[0]?.code
    if (code === ERROR_CODES.NETWORK_ERROR) {
      return err({ code: 'NETWORK_ERROR', message: 'Connection failed' })
    }
    return err(result.errors)
  }

  const { status, body } = result.data

  // 5xx: System error (fallback if not Result format)
  if (status >= 500) {
    const parsed = deserializeResult<T>(body)
    if (!parsed.ok) return parsed
    return err({ code: 'SERVER_ERROR', message: `Server error: ${status}` })
  }

  // 2xx-4xx: Trust backend Result
  return deserializeResult<T>(body)
}

// Deserialize JSON to Result<T>
function deserializeResult<T>(json: string): Result<T> {
  try {
    const parsed = JSON.parse(json)
    if (parsed.ok === true) return ok(parsed.data, parsed.meta)
    if (parsed.ok === false) return err(parsed.errors, parsed.meta)
    return ok(parsed as T)  // Raw JSON fallback
  } catch {
    return err({ code: 'PARSE_ERROR', message: 'Invalid JSON' })
  }
}

// Usage
class ApiService {
  async get<T>(url: string): Promise<Result<T>> {
    const result = await api.get(url)
    return transformResponse<T>(result)
  }
}
```

### Login Error Handling

When login fails, FetchGuard returns `err()` with `meta.params` containing the raw HTTP response:

```ts
// FetchGuard internally does:
// return err(AuthErrors.LoginFailed(), { params: { body, status } })
//
// So result.meta.params = { body: string, status: number }
```

Propagate backend errors instead of creating generic ones:

```ts
async login(credentials): Promise<Result<User>> {
  const result = await api.login(credentials)

  if (result.ok && result.data.authenticated) {
    return await this.fetchProfile()
  }

  // Login failed - extract backend response from meta.params
  if (!result.ok) {
    // meta.params contains raw HTTP response: { body: string, status: number }
    const params = result.meta?.params as { body?: string; status?: number } | undefined

    if (params?.body) {
      // Parse backend's Result format to get actual errors
      const parsed = deserializeResult<User>(params.body)
      if (!parsed.ok) return parsed  // Forward backend errors with their meta
    }

    // No parseable body - forward FetchGuard errors
    return err(result.errors)
  }

  // result.ok but not authenticated (edge case)
  return err({ code: 'LOGIN_FAILED', message: 'Authentication failed' })
}
```

## Important Notes

1. **Tokens never leave Worker** - Protected from XSS
2. **Worker returns ALL HTTP responses as ok()** - Consumer judges success
3. **Only network failures return err()** - Connection, timeout, cancelled
4. **Proactive refresh** - Refreshes before expiry, not after
5. **Domain allowlist** - Prevents token exfiltration to unknown hosts
6. **No interceptors** - Debug hooks are observe-only (security)
7. **Full URLs required** - No baseUrl config, always use absolute URLs
8. **ApiService boundary** - Transform FetchEnvelope to domain Result at service layer
