# FetchGuard

[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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

Peer dependency: `ts-micro-result`.

## Quick Start

Pick a provider that matches your backend. For SPAs that return tokens in the response body, use the Body provider. For SSR/httpOnly cookie flows, use the Cookie provider.

```ts
import { createClient, createBodyProvider } from 'fetchguard'

const api = createClient({
  baseUrl: 'https://api.example.com',
  provider: createBodyProvider({
    refreshUrl: '/auth/refresh',
    loginUrl: '/auth/login',
    logoutUrl: '/auth/logout'
  }),
  allowedDomains: ['api.example.com', '*.cdn.example.com']
})

type User = { id: string; name: string }
const res = await api.get<User[]>('/users')

if (res.isOk()) {
  console.log('Users:', res.data)
} else {
  console.error('Error:', res.errors?.[0])
}

// Cleanup
api.destroy()
```

### Login / Logout

```ts
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

const api = createClient({ baseUrl: '/api', provider })
```

### Preset Providers

- Cookie provider (SSR/httpOnly cookies)

  ```ts
  import { createCookieProvider } from 'fetchguard'

  const provider = createCookieProvider({
    refreshUrl: '/auth/refresh',
    loginUrl: '/auth/login',
    logoutUrl: '/auth/logout'
  })
  ```

- Body provider (SPA, persists refresh token in IndexedDB)

  ```ts
  import { createBodyProvider } from 'fetchguard'

  const provider = createBodyProvider({
    refreshUrl: '/auth/refresh',
    loginUrl: '/auth/login',
    logoutUrl: '/auth/logout',
    // optional custom key name in IndexedDB
    refreshTokenKey: 'refreshToken'
  })
  ```

### Provider Registry (optional)

```ts
import { registerProvider, createClient } from 'fetchguard'

registerProvider('cookie', createCookieProvider({
  refreshUrl: '/auth/refresh',
  loginUrl: '/auth/login',
  logoutUrl: '/auth/logout'
}))

const api = createClient({ baseUrl: '/api', provider: 'cookie' })
```

### Inline Provider (Advanced)

You can pass a provider object directly. Its methods are serialized and executed inside the worker sandbox. Keep them self-contained and return `Result<TokenInfo>` via `ok(...)`.

```ts
import { createClient } from 'fetchguard'
import { ok /*, err*/ } from 'ts-micro-result'
import type { TokenInfo } from 'fetchguard'

const api2 = createClient({
  baseUrl: '/api',
  provider: {
    async refreshToken(refreshToken: string | null) {
      const res = await fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        credentials: 'include'
      })
      const json = await res.json()
      return ok<TokenInfo>({
        token: json.data.accessToken,
        refreshToken: json.data.refreshToken,
        expiresAt: json.data.expiresAt,
        user: json.data.user
      })
    },

    async login(payload: unknown) {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      })
      const json = await res.json()
      return ok<TokenInfo>({
        token: json.data.accessToken,
        refreshToken: json.data.refreshToken,
        expiresAt: json.data.expiresAt,
        user: json.data.user
      })
    },

    async logout() {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
      return ok<TokenInfo>({ token: '', refreshToken: undefined, expiresAt: undefined, user: undefined })
    }
  }
})
```

Notes:
- Functions run inside the worker; do not rely on variables from your app file.
- Use standard Web APIs only (fetch/JSON); avoid importing inside the function body.
- Tokens are applied and stored inside the worker closure automatically.

### Custom Auth Methods

Add custom auth methods to your provider and call them via `api.call(name, ...args)`. The worker updates tokens and emits `AUTH_STATE_CHANGED` on success.

```ts
// Extend the inline provider with a custom method
const api3 = createClient({
  baseUrl: '/api',
  provider: {
    async loginWithOTP({ phone, code }: { phone: string; code: string }) {
      const res = await fetch('/auth/login/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
        credentials: 'include'
      })
      const json = await res.json()
      return ok<TokenInfo>({
        token: json.data.accessToken,
        refreshToken: json.data.refreshToken,
        expiresAt: json.data.expiresAt,
        user: json.data.user
      })
    },

    // plus the required methods: refreshToken/login/logout
    async refreshToken(rt: string | null) { /* ... */ },
    async login(payload: unknown) { /* ... */ },
    async logout() { /* ... */ }
  }
})

// Use the custom method
await api3.call('loginWithOTP', { phone: '+84xxxxxxxxx', code: '123456' })
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

- createClient(options)
  - baseUrl?: string
  - provider: TokenProvider | string (registry name)
  - allowedDomains?: string[]
  - debug?: boolean
  - refreshEarlyMs?: number
  - defaultTimeoutMs?: number
  - retryCount?: number
  - retryDelayMs?: number

- FetchGuardClient
  - fetch(url, options?): Result<ApiResponse<T>>
  - get/post/put/patch/delete(...): Result<ApiResponse<T>>
  - fetchWithId(url, options?): { id, result, cancel }
  - cancel(id)
  - init(payload?): Result<{ initialized: true; authenticated: boolean; expiresAt?: number | null; user?: unknown }>
  - login(payload?): Result<void>
  - logout(payload?): Result<void>
  - call(method: string, ...args): Result<void> // for custom provider methods
  - onAuthStateChanged(cb): () => void
  - ping(): Result<{ timestamp: number }>
  - destroy(): void

Types:

- ApiResponse<T> = { data: T; status: number; headers: Record<string, string> }
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
