# FetchGuard

[![npm version](https://img.shields.io/npm/v/fetchguard.svg)](https://www.npmjs.com/package/fetchguard)
![npm bundle size](https://img.shields.io/bundlephobia/min/fetchguard)
[![npm downloads](https://img.shields.io/npm/dm/fetchguard.svg)](https://www.npmjs.com/package/fetchguard)
[![license](https://img.shields.io/npm/l/fetchguard.svg)](https://github.com/minhtaimc/fetchguard/blob/main/LICENSE)


FetchGuard is a secure, type-safe API client that runs your network requests inside a Web Worker. Access tokens never touch the main thread, reducing XSS risk while providing automatic token refresh, domain allow-listing, and a clean Result-based API.

## Why FetchGuard

- XSS hardening via closure: tokens live inside a Worker IIFE closure, not in `window`, not in JS-readable cookies, and not in local/session storage.
- Proactive refresh: refresh before expiry to avoid 401s and flapping UIs.
- Modular providers: compose Storage + Parser + Strategy or use presets.
- Type-safe results: powered by `ts-micro-result` (no try/catch pyramid).
- Public endpoints: opt out per request with `requiresAuth: false`.
- Domain allow-list: block requests to unexpected hosts (wildcards and ports supported).

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

## Installation

```bash
npm install fetchguard ts-micro-result
# pnpm add fetchguard ts-micro-result
# yarn add fetchguard ts-micro-result
```

**Peer dependency**: `ts-micro-result`

### Vite Configuration (Important!)

If using **Vite**, add this to your `vite.config.ts`:

```typescript
export default defineConfig({
  optimizeDeps: {
    include: ['ts-micro-result'],
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
const res = await api.get<User[]>('https://api.example.com/users')

if (res.isOk()) {
  console.log('Users:', res.data)
} else {
  console.error('Error:', res.errors?.[0])
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

### Public Endpoints and Headers

```ts
// Skip auth for public endpoints
await api.get('/public/config', { requiresAuth: false })

// Include response headers in the result
const r = await api.get('/profile', { includeHeaders: true })
if (r.isOk()) {
  console.log(r.status, r.headers, r.data)
}
```


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

// Call custom method with different response modes
await api.call('loginWithOTP', 'both', { phone: '+1234567890', code: '123456' })
await api.call('loginWithGoogle', 'event-only', { token: 'google_token' })
await api.call('refreshToken', 'result-only')
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
- `debug?`: `boolean` - Enable debug logging in worker
- `refreshEarlyMs?`: `number` - Refresh token X ms before expiry (default: 60000)
- `defaultTimeoutMs?`: `number` - Request timeout (default: 120000)
- `retryCount?`: `number` - Retry failed requests (default: 3)
- `retryDelayMs?`: `number` - Delay between retries (default: 1000)

### FetchGuardClient Methods

**Ready State:**
- `ready()`: `boolean` - Check if worker is ready (synchronous)
- `whenReady()`: `Promise<void>` - Wait for worker to be ready
- `onReady(callback)`: `() => void` - Subscribe to ready event (returns unsubscribe function)

**HTTP Methods:**
- `fetch(url, options?)`: `Promise<Result<ApiResponse<T>>>`
- `get/post/put/patch/delete(...)`: `Promise<Result<ApiResponse<T>>>`
- `fetchWithId(url, options?)`: `{ id, result, cancel }`
- `cancel(id)`: Cancel pending request

**Authentication:**
- `login(payload?, responseMode?)`: `Promise<Result<void>>` - Login with optional response mode (default: 'both')
- `logout(payload?, responseMode?)`: `Promise<Result<void>>` - Logout with optional response mode (default: 'event-only')
- `refreshToken(responseMode?)`: `Promise<Result<void>>` - Refresh access token with optional response mode
- `call(method, responseMode?, ...args)`: `Promise<Result<void>>` - Call custom provider methods with response mode

**Events:**
- `onAuthStateChanged(callback)`: `() => void` - Subscribe to auth state changes

**Utilities:**
- `ping()`: `Promise<Result<{ timestamp: number }>>` - Ping worker
- `destroy()`: `void` - Terminate worker and cleanup

Types:

- ApiResponse<T> = { data: T; status: number; headers: Record<string, string> }
- AuthResponseMode = 'result-only' | 'event-only' | 'both'
- FetchGuardRequestInit extends RequestInit with:
  - requiresAuth?: boolean // default true
  - includeHeaders?: boolean // default false

## Message Protocol (pairs, summary)

- Main -> Worker: SETUP  -> Worker -> Main: READY
- Main -> Worker: FETCH  -> Worker -> Main: FETCH_RESULT | FETCH_ERROR
- Main -> Worker: AUTH_CALL(login/logout/...) -> Worker -> Main: RESULT (and AUTH_STATE_CHANGED event)
- Main -> Worker: CANCEL -> aborts in-worker fetch (no explicit response)
- Main -> Worker: PING  -> Worker -> Main: PONG

## Error Handling

All methods return a `Result<T>` from `ts-micro-result`.

```ts
const res = await api.get('/users')
if (res.isOk()) {
  console.log(res.data)
} else {
  const err = res.errors?.[0]
  console.warn(err?.code, err?.message)
}
```

Grouped error helpers are exported: `GeneralErrors`, `InitErrors`, `AuthErrors`, `DomainErrors`, `NetworkErrors`, `RequestErrors`.

## Auth Response Modes

Auth methods support different response modes to control how results are returned and events are emitted:

- `'result-only'`: Returns auth state in result, no event emission
- `'event-only'`: Emits auth state change event, no result data  
- `'both'`: Both returns result and emits event (recommended for login)

## Roadmap

- SSE streaming support
- Upload progress
- Interceptors
- Advanced retries (exponential backoff)
- Offline queueing

## License

MIT - see `LICENSE`.

---

Made for secure, resilient frontend API calls.
