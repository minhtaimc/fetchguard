# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
