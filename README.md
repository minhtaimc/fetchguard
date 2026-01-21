# FetchGuard

[![npm version](https://img.shields.io/npm/v/fetchguard.svg)](https://www.npmjs.com/package/fetchguard)
[![npm downloads](https://img.shields.io/npm/dm/fetchguard.svg)](https://www.npmjs.com/package/fetchguard)
[![license](https://img.shields.io/npm/l/fetchguard.svg)](https://github.com/minhtaimc/fetchguard/blob/main/LICENSE)


FetchGuard is a secure, type-safe API client that runs your network requests inside a Web Worker. Access tokens never touch the main thread, reducing XSS risk while providing automatic token refresh, domain allow-listing, and a clean Result-based API.

> **FetchGuard is a transport & security gateway, not an API client nor a business SDK.**


## Why FetchGuard

- XSS hardening via closure: tokens live inside a Worker IIFE closure, not in `window`, not in JS-readable cookies, and not in local/session storage.
- Proactive refresh: refresh before expiry to avoid 401s and flapping UIs.
- Modular providers: compose Storage + Parser + Strategy or use presets.
- Type-safe results: powered by `ts-micro-result` (no try/catch pyramid).
- Public endpoints: opt out per request with `requiresAuth: false`.
- Domain allow-list: block requests to unexpected hosts (wildcards and ports supported).
- FormData support: automatic serialization for file uploads through the Worker.


## Comparison with Alternatives

| Feature | FetchGuard | axios | ky | ofetch |
|---------|-----------|-------|-----|--------|
| XSS Token Protection | Worker + IIFE closure | None | None | None |
| Result Pattern | `ts-micro-result` | throw | throw | throw |
| Auto Token Refresh | Proactive (before expiry) | Manual | Manual | Manual |
| Domain Whitelist | Built-in | None | None | None |
| Bundle Size | ~10KB | ~30KB | ~8KB | ~5KB |

**Key differentiator:** FetchGuard is the only library that isolates tokens in a Web Worker IIFE closure, making them inaccessible to XSS attacks on the main thread.

## When to Use FetchGuard

**Good fit:**
- SPAs that need to protect tokens from XSS attacks
- Apps requiring automatic token refresh without UI flicker
- Projects that prefer Result-based error handling over try/catch
- Teams wanting domain-level request restrictions

**Not ideal for:**
- Server-side rendering (Web Workers don't run on the server)
- High-throughput scenarios requiring many concurrent requests
- Apps needing streaming responses (SSE/WebSocket)
- Legacy browser support (requires Web Worker)

## Architecture (Simplified)

```
+--------------------+       postMessage        +-------------------------+        HTTPS        +------------------+
| Main App (UI)      |  requests/results only   |  Web Worker (Sandbox)   |  fetch with auth   |  Backend API     |
| - React/Vue/...    | -----------------------> |  - IIFE closure tokens  | -----------------> |  - Auth endpoints|
| - No token access  | <----------------------- |  - Domain allow-list    | <----------------- |  - JSON payloads |
+--------------------+  data only (no tokens)   +-------------------------+    responses only  +------------------+
```

- Setup once: app configures provider; worker is ready.
- Login: worker calls BE, parses tokens, stores inside closure (never exposed).
- Authenticated request: worker ensures token, adds Authorization, calls BE, returns data only.
- Public request: `requiresAuth: false` skips token injection.

Security highlight: Web Worker sandbox + IIFE closure ensures tokens never appear in `window`, storage, or any message payload.

## Closure Isolation

Inside the worker, tokens live in a lexical closure created by an IIFE. They are not properties on `self`, not exported, and never posted back.

```ts
// worker.ts (simplified structure)
;(function () {
  let accessToken: string | null = null
  let refreshToken: string | null = null
  let expiresAt: number | null = null
  let currentUser: unknown | undefined

  self.onmessage = async (event) => {
    // Handle SETUP/FETCH/AUTH_CALL/CANCEL/PING here
    // Only status/body/headers or auth state get posted back
  }
})()
```

Practical effects:
- Scripts running in the main thread cannot read tokens (they are not in global memory or storage).
- `postMessage` payloads never include tokens; `AUTH_STATE_CHANGED` emits booleans/timestamps/user only.
- Even if an attacker obtains the `Worker` instance, there is no API surface to retrieve tokens.

## Token Storage

- Access token: worker memory only (closure; not readable by the main thread).
- Refresh token:
  - Cookie provider: httpOnly cookie managed by the browser (never readable by JS).
  - Body provider: persisted in IndexedDB via `createIndexedDBStorage` for session continuity.

## Security Model

Helps with:
- Prevents scripts in the main thread from reading tokens directly (no tokens in `window`, `localStorage`, or JS-readable cookies).
- Reduces token exfiltration risk by restricting worker fetches to an allow-listed set of domains.
- Avoids 401-triggered race conditions by refreshing early inside the worker.

Out of scope (still recommended to address):
- A fully compromised app can still ask the worker to perform actions on the user’s behalf.
- Malicious browser extensions or devtools can subvert runtime.
- Build-time or supply-chain tampering can alter provider code before it reaches the worker.

Hardening tips:
- Enable strict CSP and Trusted Types where applicable.
- Serve over HTTPS; set secure cookie attributes (httpOnly, SameSite, Secure) when using cookies.
- Rotate refresh tokens on every refresh/login and invalidate older tokens server-side; prefer one-time-use refresh tokens to limit replay risk.
- Keep tokens short-lived; rely on refresh tokens and server-side revocation.
- Use the domain allow-list aggressively (include explicit ports in development).
- Avoid logging or exposing tokens in any responses; keep login/refresh parsing inside the worker.

## Multi-Tab Refresh Behavior

When using cookie-based auth with multiple browser tabs, each tab has its own FetchGuard Worker instance but they share the same refresh token cookie. This means concurrent refresh requests are legitimate and expected.

```
Tab 1: Token expires → calls /refresh
Tab 2: Token expires → calls /refresh (same cookie)
Tab 3: Token expires → calls /refresh (same cookie)
```

**Server Requirements:**

Your auth server MUST handle concurrent refresh requests gracefully. Recommended patterns:

1. **Grace Window (Recommended)**
   Allow the old refresh token for N seconds after rotation:
   ```typescript
   // Server-side example
   const GRACE_WINDOW_MS = 30_000 // 30 seconds

   async function refreshToken(oldToken: string) {
     const record = await db.findRefreshToken(oldToken)

     if (record.rotatedAt) {
       // Token was already rotated
       const elapsed = Date.now() - record.rotatedAt
       if (elapsed < GRACE_WINDOW_MS) {
         // Within grace window: return same new tokens
         return record.replacementTokens
       }
       throw new Error('Refresh token expired')
     }

     // First use: rotate and mark
     const newTokens = generateNewTokens()
     await db.markRotated(oldToken, newTokens, Date.now())
     return newTokens
   }
   ```

2. **Token Family Tracking**
   Track token lineage and allow previous tokens within grace period.

3. **Idempotency Keys**
   Accept a unique key per refresh attempt and dedupe server-side.

**FetchGuard Grace Window:**

FetchGuard uses proactive token refresh (default: 60 seconds before expiry via `refreshEarlyMs`). This means:
- Tokens are refreshed BEFORE they expire, not after
- Multiple tabs may trigger refresh around the same time
- Your server grace window should be at least `refreshEarlyMs + network_latency`

Recommendation: Set server grace window to 30-60 seconds to safely handle multi-tab scenarios.

## Installation

```bash
npm install fetchguard
# pnpm add fetchguard
# yarn add fetchguard
```

### Vite Configuration (Important!)

If using **Vite**, add this to your `vite.config.ts`:

```typescript
export default defineConfig({
  optimizeDeps: {
    exclude: ['fetchguard']  // Required for Web Workers
  }
})
```

> **Why?** FetchGuard uses Web Workers which need special handling in Vite.
> See [BUNDLER_SETUP.md](./BUNDLER_SETUP.md) for setup guides for all bundlers (Vite, Webpack, Next.js, etc.)

## Quick Start

Pick a provider that matches your backend. For SPAs that return tokens in the response body, use the `body-auth` provider. For SSR/httpOnly cookie flows, use the `cookie-auth` provider.

```ts
import { createClient } from 'fetchguard'

const api = createClient({
  provider: {
    type: 'body-auth',  // or 'cookie-auth'
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  },
  allowedDomains: ['api.example.com', '*.cdn.example.com']
})

type User = { id: string; name: string }
const result = await api.get('https://api.example.com/users')

if (result.ok) {
  const envelope = result.data
  if (envelope.status >= 200 && envelope.status < 400) {
    const users: User[] = JSON.parse(envelope.body)
    console.log('Users:', users)
  } else {
    console.error('HTTP error:', envelope.status, envelope.body)
  }
} else {
  console.error('Network error:', result.errors[0].message)
}

// Cleanup
api.destroy()
```

### Worker Ready State

The client provides methods to check when the worker is ready:

```ts
import { createClient } from 'fetchguard'

const api = createClient({ provider: { /* ... */ } })

// Method 1: Check ready state (synchronous)
if (api.ready()) {
  console.log('Worker is ready!')
}

// Method 2: Wait for ready (async)
await api.whenReady()
console.log('Worker is now ready!')

// Method 3: Subscribe to ready event
const unsubscribe = api.onReady(() => {
  console.log('Worker ready callback')
})
// Note: Callback is called immediately if already ready
```

### Login / Logout

```ts
// Wait for worker to be ready (optional but recommended)
await api.whenReady()

// Perform login; worker stores tokens and emits an auth event
await api.login({ email: 'user@example.com', password: 'password123' })

// Subscribe to auth state changes
const unsubscribe = api.onAuthStateChanged(({ authenticated, expiresAt, user }) => {
  console.log('Auth:', authenticated, 'exp:', expiresAt, 'user:', user)
})

// Later
await api.logout()
unsubscribe()
```

### Token Exchange (Tenant Switch, Scope Change)

Exchange your current token for a new one with different context:

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

if (result.ok) {
  const { authenticated, user, expiresAt } = result.data
  console.log('New context:', user)
} else {
  // TOKEN_EXCHANGE_FAILED or NOT_AUTHENTICATED
  console.error('Exchange failed:', result.errors[0].message)
}
```

Use cases:
- Multi-tenant apps: switch between tenants without re-login
- Role/scope changes: elevate or reduce permissions
- User impersonation: admin acting as another user

### Multiple Login URLs

FetchGuard supports dynamic login URL selection for different auth methods (OAuth, phone, etc.):

```ts
// Use default login URL
await api.login({
  email: 'user@example.com',
  password: 'password123'
})

// Override with OAuth URL
await api.login(
  { code: 'oauth_code_123', provider: 'google' },
  'https://api.example.com/auth/oauth'  // ← Custom URL
)

// Override with phone auth URL
await api.login(
  { phone: '+84987654321', otp: '123456' },
  'https://api.example.com/auth/phone'  // ← Custom URL
)
```

No need to create custom methods for each auth type - just pass the URL as the second parameter!

### Public Endpoints and Headers

```ts
// Skip auth for public endpoints
await api.get('/public/config', { requiresAuth: false })

// Include response headers in the result
const r = await api.get('/profile', { includeHeaders: true })
if (r.ok) {
  console.log(r.data.status, r.data.headers, r.data.body)
}
```

### File Upload (FormData)

FetchGuard automatically serializes FormData for transfer through the Web Worker:

```ts
// Create file
const file = new File(['Hello World'], 'example.txt', { type: 'text/plain' })

// Create FormData
const formData = new FormData()
formData.append('file', file)
formData.append('filename', 'example.txt')
formData.append('description', 'Test upload')

// Method 1: Using post() - Recommended for FormData
const result = await api.post('https://api.example.com/upload', formData)

// Method 2: Using fetch() with explicit method
const result = await api.fetch('https://api.example.com/upload', {
  method: 'POST',
  body: formData
})

// Both work with put() and patch() too
await api.put('https://api.example.com/upload/123', formData)
await api.patch('https://api.example.com/upload/123', formData)

if (result.ok && result.data.status < 400) {
  console.log('Upload successful:', result.data.body)
}
```

**Features:**
- ✅ Works with post(), put(), patch(), fetch() methods
- ✅ Automatic serialization (File → ArrayBuffer → number[])
- ✅ Multiple files supported
- ✅ Unicode filenames preserved
- ✅ Large files handled efficiently
- ✅ Mixed FormData (files + strings)
- ✅ Token security maintained
- ✅ No manual configuration needed

See [FORMDATA_SUPPORT.md](./FORMDATA_SUPPORT.md) for detailed documentation.

### Cancellation

```ts
const { id, result, cancel } = api.fetchWithId('/slow')
// ... some time later
cancel()

const rr = await result // rejects with a cancellation error
```

## Provider System (Composable)

Providers are composed from three parts:

- Storage: where refresh tokens persist (e.g., IndexedDB) or none for cookie flows
- Parser: how to parse tokens from backend responses
- Strategy: how to call refresh/login/logout endpoints

```ts
import {
  createProvider,
  createIndexedDBStorage,
  bodyParser,
  createBodyStrategy
} from 'fetchguard'

const provider = createProvider({
  // Persist refresh tokens across reloads
  refreshStorage: createIndexedDBStorage('MyAppDB', 'refreshToken'),
  // Parse tokens from JSON body
  parser: bodyParser,
  // Call auth endpoints with tokens in request body
  strategy: createBodyStrategy({
    refreshUrl: '/auth/refresh',
    loginUrl: '/auth/login',
    logoutUrl: '/auth/logout'
  })
})

```

### Preset Providers

FetchGuard provides two built-in auth strategies:

**1. Cookie Auth** (SSR/httpOnly cookies)

Best for server-side rendered apps where tokens are managed via httpOnly cookies.

```ts
const api = createClient({
  provider: {
    type: 'cookie-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout'
  },
  allowedDomains: ['api.example.com']
})
```

**2. Body Auth** (SPA with IndexedDB)

Best for single-page apps where tokens are returned in response body and persisted to IndexedDB.

```ts
const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout',
    refreshTokenKey: 'refreshToken'  // Optional, defaults to 'refreshToken'
  },
  allowedDomains: ['api.example.com']
})
```

**Custom Headers for Auth APIs**

You can add custom headers to all auth requests (login, logout, refresh):

```ts
const api = createClient({
  provider: {
    type: 'body-auth',
    refreshUrl: 'https://api.example.com/auth/refresh',
    loginUrl: 'https://api.example.com/auth/login',
    logoutUrl: 'https://api.example.com/auth/logout',
    headers: {
      'X-Client-Version': '1.0.0',
      'X-Platform': 'web'
    }
  }
})
```

These headers will be included in every auth API call (login, logout, refresh token).

**Default Headers for All Requests**

You can also set default headers that will be included in ALL requests (both API calls and auth calls):

```ts
const api = createClient({
  provider: { ... },
  defaultHeaders: {
    'X-Client-Version': '1.0.0',
    'X-Platform': 'web',
    'Accept-Language': 'en-US'
  }
})

// All requests will include these headers
await api.get('/users')       // has X-Client-Version, X-Platform, Accept-Language
await api.post('/data', ...)  // has X-Client-Version, X-Platform, Accept-Language
await api.login(...)          // has X-Client-Version, X-Platform, Accept-Language + auth headers
```

**Header Priority** (later overrides earlier):
1. `defaultHeaders` (lowest priority)
2. `provider.headers` (auth requests only)
3. Per-request headers (highest priority)

### Advanced: Custom Providers via Registry

For complex auth flows, you can create custom providers and register them:

```ts
import { registerProvider, createClient, createProvider } from 'fetchguard'
import { createIndexedDBStorage } from 'fetchguard'
import { ok } from 'ts-micro-result'

// Create custom provider
const myProvider = createProvider({
  refreshStorage: createIndexedDBStorage('MyApp', 'refreshToken'),
  parser: {
    async parse(response: Response) {
      const data = await response.json()
      return {
        token: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        user: data.user
      }
    }
  },
  strategy: {
    async refreshToken(refreshToken: string | null) {
      const res = await fetch('https://api.example.com/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })
      return res
    },
    async login(payload: unknown) {
      const res = await fetch('https://api.example.com/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      return res
    },
    async logout(payload?: unknown) {
      const res = await fetch('https://api.example.com/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      })
      return res
    }
  }
})

// Register provider
registerProvider('my-custom-auth', myProvider)

// Use registered provider
const api = createClient({
  provider: 'my-custom-auth',  // Reference by name
  allowedDomains: ['api.example.com']
})
```


### Custom Auth Methods (Advanced)

You can add custom auth methods to your provider strategy and call them via `api.call(methodName, ...args)`:

```ts
import { createProvider, createIndexedDBStorage, bodyParser } from 'fetchguard'
import { ok } from 'ts-micro-result'

const myProvider = createProvider({
  refreshStorage: createIndexedDBStorage('MyApp', 'refreshToken'),
  parser: bodyParser,
  strategy: {
    // Standard methods
    async refreshToken(refreshToken: string | null) { /* ... */ },
    async login(payload: unknown) { /* ... */ },
    async logout(payload?: unknown) { /* ... */ },

    // Custom method - OTP login
    async loginWithOTP(payload: { phone: string; code: string }) {
      const res = await fetch('https://api.example.com/auth/login/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      return res
    }
  }
})

// Register and use
registerProvider('otp-auth', myProvider)
const api = createClient({ provider: 'otp-auth' })

// Call custom method with event emission
await api.call('loginWithOTP', true, { phone: '+1234567890', code: '123456' })
await api.call('loginWithGoogle', false, { token: 'google_token' })  // Silent
await api.call('refreshToken', true)  // With event
```

## Domain Allow-List

Limit requests to known hosts. Supports wildcards and optional ports.

```ts
allowedDomains: [
  'api.example.com',     // exact host
  '*.example.com',       // any subdomain
  'localhost:5173'       // include port match
]
```

## Bundler Notes

FetchGuard creates a Worker using `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`.

- Vite/Rollup: supported out of the box
- Webpack 5: supported via `new URL()` ESM pattern
- Older toolchains may require a custom worker loader

The library targets modern browsers with Web Worker and (optionally) IndexedDB support.

## API Reference

### `createClient(options)`

- `provider`: `ProviderPresetConfig | string` (required)
  - Config object: `{ type: 'cookie-auth' | 'body-auth', refreshUrl, loginUrl, logoutUrl, ... }`
  - String: Registered provider name
- `allowedDomains?`: `string[]` - Domain whitelist (supports wildcards)
- `refreshEarlyMs?`: `number` - Refresh token X ms before expiry (default: 60000)

### FetchGuardClient Methods

**Ready State:**
- `ready()`: `boolean` - Check if worker is ready (synchronous)
- `whenReady()`: `Promise<void>` - Wait for worker to be ready
- `onReady(callback)`: `() => void` - Subscribe to ready event (returns unsubscribe function)

**HTTP Methods:**
- `fetch(url, options?)`: `Promise<Result<FetchEnvelope>>`
- `get/post/put/patch/delete(...)`: `Promise<Result<FetchEnvelope>>`
- `fetchWithId(url, options?)`: `{ id, result, cancel }`
- `cancel(id)`: Cancel pending request

**Authentication:**
- `login(payload?, url?, emitEvent?)`: `Promise<Result<AuthResult>>` - Login with optional URL override and event emission (default: true)
- `logout(payload?, emitEvent?)`: `Promise<Result<AuthResult>>` - Logout with optional event emission (default: true)
- `refreshToken(emitEvent?)`: `Promise<Result<AuthResult>>` - Refresh access token with optional event emission (default: true)
- `exchangeToken(url, options?, emitEvent?)`: `Promise<Result<AuthResult>>` - Exchange current token for new one (tenant switch, scope change)
- `call(method, emitEvent?, ...args)`: `Promise<Result<AuthResult>>` - Call custom provider methods with event emission

**Events:**
- `onAuthStateChanged(callback)`: `() => void` - Subscribe to auth state changes

**Utilities:**
- `ping()`: `Promise<Result<{ timestamp: number }>>` - Ping worker
- `destroy()`: `void` - Terminate worker and cleanup

Types:

- FetchEnvelope = { status: number; body: string; contentType: string; headers: Record<string, string> }
  - `status`: HTTP status code (2xx, 3xx, 4xx, 5xx) - Worker returns ALL HTTP responses
  - `body`: Raw string (text/JSON) or base64 (for binary content like images, PDFs)
  - `contentType`: Content type header (always present, e.g., 'application/json', 'image/png')
  - Use `isBinaryContentType(contentType)` to detect binary responses
  - Use `base64ToArrayBuffer(body)` to decode binary data
  - **Note:** Worker no longer judges HTTP status. Consumer code should check `envelope.status` to determine success/error.
- AuthResult = { authenticated: boolean; user?: unknown; expiresAt?: number | null }
- FetchGuardRequestInit extends RequestInit with:
  - requiresAuth?: boolean // default true
  - includeHeaders?: boolean // default false
  - signal?: AbortSignal // for cancellation

## Helper Functions

FetchGuard exports helper functions for common Result patterns:

```ts
import {
  isSuccess,
  isClientError,
  isServerError,
  isNetworkError,
  parseJson,
  getErrorMessage,
  matchResult,
  ERROR_CODES
} from 'fetchguard'

const result = await api.get('/users')

// Simple checks
if (isSuccess(result)) {
  const users = parseJson<User[]>(result)
}

// Pattern matching
const message = matchResult(result, {
  success: (envelope) => `Got ${parseJson(result)?.length} users`,
  clientError: (envelope) => `Client error: ${envelope.status}`,
  serverError: (envelope) => `Server error: ${envelope.status}`,
  networkError: (errors) => `Network failed: ${errors[0]?.message}`
})

// Type-safe error code matching
if (!result.ok && result.errors[0]?.code === ERROR_CODES.NETWORK_ERROR) {
  console.log('Connection failed')
}
```

**Available helpers:**
- `isSuccess(result)` - Check if 2xx response
- `isClientError(result)` - Check if 4xx response
- `isServerError(result)` - Check if 5xx response
- `isNetworkError(result)` - Check if network error (no response)
- `parseJson<T>(result)` - Safe JSON parsing with type inference
- `getErrorMessage(result)` - Extract error message
- `getErrorBody<T>(result)` - Get typed error body from HTTP errors
- `getStatus(result)` / `hasStatus(result, code)` - Status code helpers
- `matchResult(result, handlers)` - Pattern matching

**Error codes** (`ERROR_CODES`):
- `NETWORK_ERROR`, `REQUEST_CANCELLED`, `REQUEST_TIMEOUT`
- `HTTP_ERROR`, `RESPONSE_PARSE_FAILED`, `QUEUE_FULL`
- `LOGIN_FAILED`, `LOGOUT_FAILED`, `TOKEN_REFRESH_FAILED`, `NOT_AUTHENTICATED`
- `DOMAIN_NOT_ALLOWED`, `INIT_ERROR`, `UNEXPECTED`

## Message Protocol (pairs, summary)

- Main -> Worker: SETUP  -> Worker -> Main: READY | SETUP_ERROR
- Main -> Worker: FETCH  -> Worker -> Main: FETCH_RESULT | FETCH_ERROR
- Main -> Worker: AUTH_CALL(login/logout/...) -> Worker -> Main: AUTH_CALL_RESULT | ERROR (and AUTH_STATE_CHANGED event)
- Main -> Worker: CANCEL -> aborts in-worker fetch (no explicit response)
- Main -> Worker: PING  -> Worker -> Main: PONG | ERROR

## Error Handling

All methods return a `Result<T>` from `ts-micro-result` v3.

```ts
const result = await api.get('/users')
if (result.ok) {
  const envelope = result.data
  // Check HTTP status - worker doesn't judge
  if (envelope.status >= 200 && envelope.status < 400) {
    console.log('Success:', JSON.parse(envelope.body))
  } else {
    console.log('HTTP error:', envelope.status, envelope.body)
  }
} else {
  // Network error only (connection failed, timeout, cancelled)
  const err = result.errors[0]
  console.warn(err.code, err.message)
}
```

Grouped error helpers are exported: `GeneralErrors`, `InitErrors`, `AuthErrors`, `DomainErrors`, `RequestErrors`.

### Request Handling (v2.0 - New Pattern)

In v2.0, the Worker returns ALL HTTP responses as `ok(FetchEnvelope)`. Only network failures return `err()`:

```ts
const result = await api.post('/data', payload)

if (result.ok) {
  const envelope = result.data

  // Success (2xx/3xx)
  if (envelope.status >= 200 && envelope.status < 400) {
    console.log('Success:', JSON.parse(envelope.body))
  }
  // HTTP errors (4xx/5xx) - still got a response!
  else {
    console.log(`HTTP ${envelope.status} error`)
    console.log('Response body:', envelope.body)

    // Check specific status codes
    if (envelope.status === 404) {
      console.log('Resource not found')
    } else if (envelope.status === 401) {
      console.log('Unauthorized - need to login')
    } else if (envelope.status === 422) {
      // Parse validation errors from server
      const errors = JSON.parse(envelope.body)
      console.log('Validation errors:', errors)
    }
  }
} else {
  // Network errors ONLY - no HTTP response received
  const err = result.errors[0]

  if (err.code === 'NETWORK_ERROR') {
    console.log('Connection failed - check internet')
  } else if (err.code === 'REQUEST_CANCELLED') {
    console.log('Request was cancelled')
  }
}
```

**Available Error Codes (network errors only):**
- `NETWORK_ERROR` - Connection failed, timeout, or DNS error (no response)
- `REQUEST_CANCELLED` - Request was cancelled via `cancel()` method
- `RESPONSE_PARSE_FAILED` - Failed to read/parse response body

**Key Points (v2.0):**
- ✅ Worker returns `ok(envelope)` for ALL HTTP responses (2xx-5xx)
- ✅ Worker returns `err()` ONLY for network failures
- ✅ Consumer code decides what is "success" based on `envelope.status`
- ✅ Full response body available for HTTP errors (validation errors, etc.)
- ✅ Cleaner separation: transport errors vs business errors

### Auth Errors (Login/Refresh/Logout)

Auth errors include HTTP status and response body in `meta.params`:

```ts
const result = await api.login({ email: 'wrong@example.com', password: 'wrong' })

if (!result.ok) {
  const error = result.errors[0]
  const params = result.meta?.params as { body?: string; status?: number }

  console.log('Code:', error.code)            // 'LOGIN_FAILED'
  console.log('Message:', error.message)      // "Login failed"
  console.log('Status:', params?.status)      // 401
  console.log('Body:', params?.body)          // '{"error": "Invalid credentials"}'

  // Parse JSON error details from server
  try {
    const details = JSON.parse(params?.body || '{}')
    console.log('Server error:', details.error)  // "Invalid credentials"
  } catch {
    // Not JSON - use raw body
    console.log('Raw error:', params?.body)
  }
}
```

**Available Auth Error Codes:**
- `LOGIN_FAILED` - Login failed with HTTP status and response body in `meta.params`
- `TOKEN_REFRESH_FAILED` - Token refresh failed with HTTP status and response body
- `TOKEN_EXCHANGE_FAILED` - Token exchange failed with HTTP status and response body
- `LOGOUT_FAILED` - Logout failed with HTTP status and response body
- `NOT_AUTHENTICATED` - User is not authenticated (attempted auth-required request without token)

**Key Points (v2.0):**
- ✅ Auth errors use `meta.params` for custom data (ts-micro-result v3 pattern)
- ✅ Response body available in `result.meta?.params?.body`
- ✅ HTTP status available in `result.meta?.params?.status`
- ✅ Parse JSON yourself if server returns structured error messages

## Auth Methods and Events

### AuthResult Return Value

All auth methods (`login`, `logout`, `refreshToken`, `call`) now return `Promise<Result<AuthResult>>`:

```ts
interface AuthResult {
  authenticated: boolean  // Is user authenticated?
  user?: unknown         // User info (if available)
  expiresAt?: number | null  // Token expiry timestamp
}
```

### Event Emission Control

The `emitEvent` parameter controls whether `AUTH_STATE_CHANGED` event is emitted:

```ts
// Emit event (default - updates UI)
await api.login(credentials, true)
await api.login(credentials)  // Same as above

// Silent (no event - useful for checks)
const result = await api.refreshToken(false)
if (result.ok) {
  const { authenticated, expiresAt } = result.data
  // Check state without triggering listeners
}
```

**Benefits:**
- ✅ Always get `AuthResult` back (no void)
- ✅ Simple boolean instead of 3-value enum
- ✅ Consistent API across all auth methods

## Testing

```bash
# Run all tests
npm test

# Run browser tests (includes FormData serialization)
npm run test:browser

# Run with coverage
npm run test:coverage
```

FormData serialization is tested in [tests/browser/formdata-serialization.test.ts](./tests/browser/formdata-serialization.test.ts) with 11 test cases covering:
- Single/multiple file uploads
- Unicode filenames
- Binary files
- Large files (1MB in ~40ms)
- Mixed FormData

## Roadmap

- SSE streaming support
- Upload progress tracking
- Offline queueing (with careful auth handling)

## Claude Code Skill

FetchGuard includes a [Claude Code](https://claude.ai/code) skill for AI-assisted development. To use it:

1. Copy the skill folder to your global Claude settings:
   ```bash
   # macOS/Linux
   cp -r node_modules/fetchguard/skills/fetchguard ~/.claude/skills/

   # Windows
   xcopy /E /I node_modules\fetchguard\skills\fetchguard %USERPROFILE%\.claude\skills\fetchguard
   ```

2. Use `/fetchguard` in Claude Code when working with FetchGuard in any project.

## License

MIT - see `LICENSE`.

---

Made for secure, resilient frontend API calls.
