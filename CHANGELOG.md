# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.5] - 2025-10-27

### Added

- **Detailed Auth Error Information** - Provider now includes response body in auth errors
  - Login/refresh/logout failures now return HTTP status code and response body
  - Error structure: `{ status: number, meta: { body: string } }`
  - Access via `result.errors[0].status` and `result.errors[0].meta?.body`
  - Consistent with fetch error handling pattern

### Example

```typescript
const result = await api.login({ email: 'wrong@example.com', password: 'wrong' })

if (result.isError()) {
  const error = result.errors[0]
  console.log('Status:', error.status)        // 401
  console.log('Message:', error.message)      // "Login failed"
  console.log('Body:', error.meta?.body)      // '{"error": "Invalid credentials"}'

  // Parse JSON error details from server
  try {
    const details = JSON.parse(error.meta?.body || '{}')
    console.log('Error:', details.error)      // "Invalid credentials"
  } catch {}
}
```

## [1.5.4] - 2025-10-27

### Added

- **Multiple Login URLs Support** - Dynamic login endpoint selection via URL parameter
  - `login()` now accepts optional `url` parameter: `login(payload, url?, emitEvent?)`
  - Override configured `loginUrl` on a per-call basis
  - Support multiple auth methods (OAuth, phone, biometric) without custom methods
  - URL flows through entire stack: `client → worker → provider → strategy`
  - Works with both `createBodyStrategy` and `createCookieStrategy`

### Changed

- **Updated Type Signatures** for login method:
  - `AuthStrategy.login(payload, url?)` - Strategy level
  - `TokenProvider.login(payload, url?)` - Provider level
  - `FetchGuardClient.login(payload?, url?, emitEvent?)` - Client level

### Examples

```typescript
// Use default URL
await api.login({ email: 'user@example.com', password: 'secret' })

// Override with OAuth URL
await api.login(
  { code: 'oauth_123', provider: 'google' },
  'https://api.example.com/auth/oauth'
)

// Override with phone URL
await api.login(
  { phone: '+84987654321', otp: '123456' },
  'https://api.example.com/auth/phone'
)
```

## [1.5.3] - 2025-10-27

### Changed

- **BREAKING**: Simplified error categories - unified `RequestErrors` for all request/response errors
  - Removed `NetworkErrors` and `HttpErrors` categories
  - All request-related errors now in single `RequestErrors` category
  - Easier to use: only one category to remember for fetch errors

- **HTTP Error Handling** - Single `HTTP_ERROR` code with status in metadata
  - Worker: Always returns `ok()` for all HTTP responses (2xx, 3xx, 4xx, 5xx)
  - Worker: Only returns `err()` for network/timeout/cancel errors
  - Client: Splits success/error based on HTTP status code (2xx/3xx = ok, 4xx/5xx = err)
  - HTTP 4xx/5xx use `RequestErrors.HttpError({ status })` with `defineErrorAdvanced`
  - Error message includes status code: "HTTP 404 error", "HTTP 500 error"
  - Response body available in `result.meta` for debugging

- **Removed unused error codes**
  - Removed `FetchError` and `Timeout` (never used in codebase)
  - Only keep errors that are actually used: `NetworkError`, `Cancelled`, `HttpError`, `ResponseParseFailed`

### Fixed

- **Error Classification** - HTTP errors vs Network errors
  - HTTP errors (4xx/5xx) use `RequestErrors.HttpError` with status code
  - Network errors (connection failed) use `RequestErrors.NetworkError`
  - Response body parsing errors use `RequestErrors.ResponseParseFailed`
  - Cancelled requests use `RequestErrors.Cancelled`

### Documentation

- Updated README with unified `RequestErrors` category
- Simplified error handling examples
- Migration guide for error code checking

### Migration Guide

**Error Category Changes:**

```typescript
// Before (v1.5.1)
import { NetworkErrors, HttpErrors, RequestErrors } from 'fetchguard'

if (err?.code === 'HTTP_NOT_FOUND') { ... }
if (err?.code === 'NETWORK_ERROR') { ... }

// After (v1.5.2)
import { RequestErrors } from 'fetchguard'

// Single error code for all HTTP errors
if (err?.code === 'HTTP_ERROR') {
  const status = result.meta?.status
  if (status === 404) {
    console.log('Not found')
  } else if (status === 401) {
    console.log('Unauthorized')
  }
}

if (err?.code === 'NETWORK_ERROR') {
  console.log('Connection failed')
}
```

**Usage Pattern:**

```typescript
const result = await api.post('/data', payload)

if (!result.ok) {
  const err = result.errors?.[0]

  // HTTP errors (4xx/5xx) - has response body
  if (err?.code === 'HTTP_ERROR') {
    console.log('HTTP error:', result.meta?.status)
    console.log('Response:', result.meta?.body)
  }

  // Network errors - no response
  else if (err?.code === 'NETWORK_ERROR') {
    console.log('Connection failed')
  }

  // Cancelled
  else if (err?.code === 'REQUEST_CANCELLED') {
    console.log('Cancelled by user')
  }
}
```

## [1.5.0] - 2025-10-26

### Added

- **SETUP_ERROR Message** - Clear error reporting when worker setup fails
  - Worker now sends `SETUP_ERROR` message with error details immediately on setup failure
  - Client rejects setup promise with descriptive error message
  - No more 10-second timeout wait for setup errors
  - Symmetric with `READY` message (READY = success, SETUP_ERROR = failure)

### Changed

- **BREAKING**: Renamed `RESULT` message to `ERROR` for clarity
  - Old: `RESULT` message with `{ result: SerializedResult }` payload
  - New: `ERROR` message with `{ errors: ErrorDetail[] }` payload
  - More semantic - clearly indicates error responses
  - Simpler payload - only transfers error details, not entire Result object
  - Smaller message size - no serialization of success/status fields
  - All error scenarios now use consistent `ERROR` message

- **Type Safety Improvements**
  - `provider: any` → `TokenProvider | null` with proper null checks
  - `makeApiRequest options: any` → `FetchGuardRequestInit`
  - `post/put/patch body?: any` → `body?: unknown`
  - `sendResult()` → `sendError()` with `Result<unknown>` parameter
  - Type guard functions use `unknown` instead of `any`
  - Better TypeScript inference throughout codebase

- **Improved Error Handling**
  - Provider null checks added to `ensureValidToken()` and `AUTH_CALL`
  - Setup validates provider creation and throws clear error if null
  - All error responses now use `sendError()` with `ErrorDetail[]`
  - Removed dependency on `ts-micro-result` serialization format for errors

### Fixed

- **Delete Properties Pattern** - Replaced `delete (obj as any).prop` with destructuring
  ```typescript
  // Before
  delete (fetchOptions as any).requiresAuth

  // After
  const { requiresAuth, includeHeaders, ...fetchOptions } = options
  ```

- **Provider Type Safety** - Provider is guaranteed non-null after SETUP
  - Setup fails with `SETUP_ERROR` if provider initialization fails
  - Runtime checks ensure provider exists before use
  - Clear error messages when provider is not initialized

### Internal

- Removed unused imports (`fromJSON`, `GeneralErrors` from client)
- Updated message protocol documentation
- Improved code comments and type annotations
- Consistent error handling across all message types

### Migration Guide

**ERROR Message Handling:**

If you're handling worker messages directly (advanced usage only):

```typescript
// Before (v1.4.x)
if (type === MSG.RESULT) {
  const result = fromJSON(payload.result)
  // handle result
}

// After (v1.5.0)
if (type === MSG.ERROR) {
  const errors = payload.errors  // ErrorDetail[]
  const result = err(errors)
  // handle error result
}
```

**Note:** Most users don't need to change anything - the client handles message protocol internally.

## [1.4.0] - 2025-10-26

### Added

- **Binary Response Support** - Auto base64 encoding for binary content
  - `contentType` field added to `ApiResponse` - always present, indicates content type
  - Worker auto-detects binary responses (images, PDFs, videos, etc.)
  - Binary data automatically encoded as base64 for safe transfer through postMessage
  - New utilities: `base64ToArrayBuffer()`, `isBinaryContentType()`
  - Example: [example/binary-response.ts](./example/binary-response.ts)

- **Type Safety Improvements**
  - Added explicit return type to `makeApiRequest()`: `Promise<Result<ApiResponse>>`
  - Removed anti-pattern `return null as any` in favor of proper try-catch
  - Refactored `sendFetchResult()` to accept `ApiResponse` object instead of multiple params

### Changed

- **ApiResponse Structure** - Now includes `contentType` field
  ```typescript
  interface ApiResponse {
    body: string          // Text/JSON or base64 (for binary)
    status: number
    contentType: string   // Always present (e.g., 'application/json', 'image/png')
    headers: Record<string, string>
  }
  ```

### Removed

- **BREAKING**: Removed unused configuration options
  - `debug` option (not used in production, use browser DevTools instead)
  - `defaultTimeoutMs` option (timeout should be handled at request level)
  - `retryCount` option (not implemented, proactive token refresh prevents most failures)
  - `retryDelayMs` option (not implemented)
  - Removed constants: `DEFAULT_TIMEOUT_MS`, `DEFAULT_RETRY_COUNT`, `DEFAULT_RETRY_DELAY_MS`

### Migration Guide

**Binary Responses:**
```typescript
import { base64ToArrayBuffer, isBinaryContentType } from 'fetchguard'

const result = await api.get('/image.png')
if (result.ok) {
  const { body, contentType } = result.value

  if (isBinaryContentType(contentType)) {
    // Decode base64 to binary
    const arrayBuffer = base64ToArrayBuffer(body)
    const blob = new Blob([arrayBuffer], { type: contentType })
    const url = URL.createObjectURL(blob)
  } else {
    // Parse text/JSON
    const data = JSON.parse(body)
  }
}
```

**Removed Options:**
```typescript
// Before (v1.3.x)
const api = createClient({
  provider: { ... },
  debug: true,              // ❌ Removed
  defaultTimeoutMs: 30000,  // ❌ Removed
  retryCount: 3,            // ❌ Removed
  retryDelayMs: 1000        // ❌ Removed
})

// After (v1.4.0)
const api = createClient({
  provider: { ... },
  // Only these options remain:
  allowedDomains: ['api.example.com'],
  refreshEarlyMs: 60000
})
```

## [1.2.0] - 2025-10-25

### Added

- **AuthResult Interface** - New standardized interface for auth state information
  - `authenticated: boolean` - Authentication status
  - `user?: unknown` - User data (if available)
  - `expiresAt?: number | null` - Token expiry timestamp
  - Used consistently across both auth method returns AND `AUTH_STATE_CHANGED` events

- **AUTH_CALL_RESULT Message** - New message type for auth method responses
  - Separates auth results from generic RESULT messages
  - Provides type-safe `AuthResult` payload

- **Smart Field Preservation** - Intelligent token state updates
  - Only updates fields that are explicitly provided by the API
  - Preserves existing values when APIs don't return certain fields
  - Uses `'key' in object` pattern to detect field presence vs omission
  - Supports flexible custom auth methods (e.g., `updateUserInfo`, `verifyOTP`)

- **Optional Token Field** - `token` is now optional in `TokenInfo`
  - Enables custom auth methods that don't update tokens
  - Consistent with other optional fields (`user`, `expiresAt`, `refreshToken`)

- **Comprehensive Documentation**
  - [USER_PRESERVATION.md](./USER_PRESERVATION.md) - Smart field preservation guide
  - [AUTHRESULT.md](./AUTHRESULT.md) - AuthResult API documentation
  - Updated [README.md](./README.md) with v1.2.0 changes
  - Updated [CLAUDE.md](./CLAUDE.md) with recent changes

### Changed

- **BREAKING**: Auth methods now return `Promise<Result<AuthResult>>` instead of `Promise<Result<void>>`
  - `login(payload?, emitEvent?)` - Returns AuthResult with auth state
  - `logout(payload?, emitEvent?)` - Returns AuthResult with auth state
  - `refreshToken(emitEvent?)` - Returns AuthResult with auth state
  - `call(method, emitEvent?, ...args)` - Returns AuthResult with auth state

- **BREAKING**: Replaced `AuthResponseMode` enum with simple `emitEvent` boolean
  - **Before**: `login(payload, 'both')` / `'event-only'` / `'result-only'`
  - **After**: `login(payload, true)` / `login(payload, false)`
  - Default: `emitEvent = true` (emits `AUTH_STATE_CHANGED` event)

- **Worker Token State Management** - Complete rewrite of `setTokenState()`
  - Applies smart preservation to ALL optional fields
  - Only updates fields explicitly provided in `TokenInfo`
  - Prevents data loss when APIs return partial responses

### Removed

- **BREAKING**: Removed `AuthResponseMode` type
  - No longer exported from main package
  - Replaced with boolean `emitEvent` parameter

### Fixed

- **User Data Preservation** - User info no longer lost after token refresh
  - Previously: `refreshToken()` would clear `user` if API didn't return it
  - Now: Preserves existing `user` when not in API response

- **Field Data Loss** - All optional fields preserved correctly
  - Previously: `expiresAt`, `refreshToken` cleared if not in response
  - Now: All fields use smart preservation logic

### Migration Guide (v1.1.x → v1.2.0)

#### 1. Update Auth Method Calls

```typescript
// Before (v1.1.x)
await api.login(credentials, 'both')        // AuthResponseMode enum
await api.logout(undefined, 'event-only')
const result = await api.refreshToken('result-only')  // Returns Result<void>

// After (v1.2.0)
await api.login(credentials, true)          // Boolean emitEvent
await api.logout(undefined, true)
const result = await api.refreshToken(false) // Returns Result<AuthResult>

if (result.isOk()) {
  console.log(result.data.authenticated)  // Access auth state
  console.log(result.data.user)
  console.log(result.data.expiresAt)
}
```

#### 2. Update Type Imports

```typescript
// Before (v1.1.x)
import type { AuthResponseMode } from 'fetchguard'

// After (v1.2.0)
import type { AuthResult } from 'fetchguard'
```

#### 3. Handle AuthResult Returns

```typescript
// Before (v1.1.x) - No useful return value
await api.login(credentials)
// Had to rely on onAuthStateChanged callback

// After (v1.2.0) - Get auth state directly
const result = await api.login(credentials)
if (result.isOk()) {
  const { authenticated, user, expiresAt } = result.data
  // Use auth state immediately
}
```

#### 4. Custom Auth Methods

```typescript
// Before (v1.1.x) - Token always required
const myProvider = createProvider({
  strategy: {
    async updateUserInfo(payload) {
      const res = await fetch('/api/user', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      return {
        token: '???',  // Had to provide token even if not changing
        user: data.user
      }
    }
  }
})

// After (v1.2.0) - Token optional, smart preservation
const myProvider = createProvider({
  strategy: {
    async updateUserInfo(payload) {
      const res = await fetch('/api/user', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      return {
        user: data.user  // Only return what changed
        // token, expiresAt, refreshToken preserved automatically
      }
    }
  }
})
```

---

## [1.1.4] - 2025-10-25

### Added
- Implement `AuthResponseMode` for auth operations

---

## [1.1.3] - 2025-10-23

### Changed
- Expand to comprehensive bundler setup guide

### Added
- Vite setup guide and configuration

---

## [1.1.0] - 2025-10-24

### Security
- **BREAKING**: Removed unsafe `eval()` serialization
- Replaced provider serialization with safe config-based approach

### Added
- `ProviderPresetConfig` type for JSON-serializable provider configuration
- Built-in presets: `'cookie-auth'` and `'body-auth'`
- `buildProviderFromPreset()` helper in worker
- `typecheck` script for early type error detection

### Changed
- **BREAKING**: `provider` parameter now accepts preset configs instead of `TokenProvider` instances
- **BREAKING**: Removed `baseUrl` config - all URLs must be fully qualified
- Message protocol: `providerCode` → `providerConfig`

### Removed
- **BREAKING**: `serializeProvider()` function
- **BREAKING**: `eval()` usage in worker
- **BREAKING**: `baseUrl` from `FetchGuardOptions` and `WorkerConfig`

---

## [1.0.0] - 2025-10-23

### Added
- Initial release with core features
- Web Worker-based token isolation
- Automatic token refresh
- Modular provider system
- Result-based error handling
- Domain allow-list validation
- Event system for auth state changes
- Request cancellation support

---

[1.2.0]: https://github.com/minhtaimc/fetchguard/compare/v1.1.4...v1.2.0
[1.1.4]: https://github.com/minhtaimc/fetchguard/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/minhtaimc/fetchguard/compare/v1.1.0...v1.1.3
[1.1.0]: https://github.com/minhtaimc/fetchguard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/minhtaimc/fetchguard/releases/tag/v1.0.0
