/// <reference lib="webworker" />

import type { WorkerConfig } from './types'
import type { MainToWorkerMessage } from './messages'
// removed error classes import; we use Result-based errors instead
import { ok, err, type Result } from 'ts-micro-result'
import { MSG } from './messages'
import { DEFAULT_REFRESH_EARLY_MS } from './constants'
import {
  InitErrors,
  DomainErrors,
  NetworkErrors,
  RequestErrors,
  GeneralErrors
} from './errors'
import { sendAuthStateChanged, sendPong, sendReady, sendResult, sendFetchResult, sendFetchError } from './worker-post'

/**
 * IIFE Closure to protect sensitive tokens from external access
 * Inspired by api-worker.js security pattern
 */
;(function () {
  let config: WorkerConfig | null = null
  let provider: any = null
  let accessToken: string | null = null
  let refreshToken: string | null = null // Refresh token in worker memory
  let expiresAt: number | null = null
  let currentUser: unknown | undefined
  const pendingControllers = new Map<string, AbortController>()
  let refreshPromise: Promise<void> | null = null // Prevent concurrent refresh

/**
 * Ensure we have a valid access token (not expired).
 * If token is missing or expired, refresh it.
 * Prevents concurrent refresh attempts.
 */
async function ensureValidToken(): Promise<Result<string | null>> {
  // If we have a valid token that's not expired (with buffer), return it
  if (accessToken && expiresAt) {
    const refreshEarlyMs = config?.refreshEarlyMs ?? DEFAULT_REFRESH_EARLY_MS
    const timeLeft = expiresAt - Date.now()
    if (timeLeft > refreshEarlyMs) {
      return ok(accessToken)
    }
  }

  // If refresh is already in progress, wait for it
  if (refreshPromise) {
    await refreshPromise
    return ok(accessToken)
  }

  // Start refresh
  refreshPromise = (async () => {
    try {
      // Gọi provider.refreshToken() với refreshToken từ memory
      const valueRes = await provider.refreshToken(refreshToken)

      if (valueRes.isError()) {
        // Refresh failed - clear token state
        setTokenState({ token: null, expiresAt: null, user: undefined, refreshToken: undefined })
        return
      }

      const tokenInfo = valueRes.data

      // Update access token + refresh token trong memory
      setTokenState(tokenInfo)
    } finally {
      refreshPromise = null
    }
  })()

  await refreshPromise
  return ok(accessToken)
}

/**
 * Validate domain against allowed domains
 */
function validateDomain(url: string): boolean {
  if (!config?.allowedDomains?.length) {
    return true
  }

  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    const port = urlObj.port

    for (const entry of config.allowedDomains) {
      const idx = entry.lastIndexOf(':')
      const hasPort = idx > -1 && entry.indexOf(':') === idx
      const pattern = hasPort ? entry.slice(0, idx) : entry
      const entryPort = hasPort ? entry.slice(idx + 1) : ''
      const isWildcard = pattern.startsWith('*.')
      const base = isWildcard ? pattern.slice(2) : pattern

      const hostnameMatch = isWildcard
        ? (hostname === base || hostname.endsWith('.' + base))
        : (hostname === base)
      
      if (!hostnameMatch) continue

      if (hasPort) {
        if (port === entryPort) return true
        continue
      }
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Make API request with proactive token management
 */
async function makeApiRequest(url: string, options: any = {}) {
  if (!config) {
    return err(InitErrors.NotInitialized())
  }

  // Validate domain
  if (!validateDomain(url)) {
    return err(DomainErrors.NotAllowed({ url }))
  }

  // Extract FetchGuard-specific options
  const requiresAuth = options.requiresAuth !== false // Default: true
  const includeHeaders = options.includeHeaders === true // Default: false
  const fetchOptions: RequestInit = { ...options }
  delete (fetchOptions as any).requiresAuth // Remove custom fields before fetch
  delete (fetchOptions as any).includeHeaders

  // Prepare headers
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string> || {})
  }

  // Only add Content-Type if not already set and body is present
  if (!headers['Content-Type'] && !headers['content-type'] && fetchOptions.body) {
    // Only set JSON content-type if body is an object (will be stringified)
    if (typeof fetchOptions.body === 'object' && !(fetchOptions.body instanceof FormData) && !(fetchOptions.body instanceof URLSearchParams)) {
      headers['Content-Type'] = 'application/json'
    }
  }

  // Conditionally add auth token (only for protected APIs)
  if (requiresAuth) {
    const tokenRes = await ensureValidToken()
    if (tokenRes.isError()) return tokenRes

    const token = tokenRes.data
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  // Make request (non-throwing)
  let response: Response | null = null
  let networkErr: Result<never> | null = null
  response = await fetch(url, { ...fetchOptions, headers, credentials: 'include' }).catch((e) => {
    const aborted = (e && (e as any).name === 'AbortError')
    networkErr = aborted ? err(RequestErrors.Cancelled()) : err(NetworkErrors.NetworkError({ message: String(e) }))
    return null as any
  })
  if (!response) return (networkErr ?? err(NetworkErrors.NetworkError({ message: 'Unknown network error' })))

  // Get response body as text (main thread will parse JSON if needed)
  const body = await response.text()
  let responseHeaders: Record<string, string> | undefined
  if (includeHeaders) {
    responseHeaders = {}
    response.headers.forEach((value, key) => {
      (responseHeaders as Record<string, string>)[key] = value
    })
  }

  // Return success/error - main thread will parse body
  return response.ok
    ? ok({ body, status: response.status, headers: responseHeaders })
    : err(NetworkErrors.HttpError({ message: `HTTP ${response.status}: ${body}` }))
}

/**
 * Update token state from TokenInfo and auto emit AUTH_STATE_CHANGED
 */
function setTokenState(tokenInfo: { token: string | null; expiresAt?: number | null; user?: unknown; refreshToken?: string }) {
  accessToken = tokenInfo.token
  expiresAt = tokenInfo.expiresAt ?? null
  currentUser = tokenInfo.user
  refreshToken = tokenInfo.refreshToken ?? null

  // Auto emit AUTH_STATE_CHANGED event
  postAuthChanged()
}

/**
 * Emit AUTH_STATE_CHANGED event based on current state
 * authenticated = true if we have valid non-expired token
 */
function postAuthChanged() {
  const now = Date.now()
  const authenticated = accessToken !== null && accessToken !== '' && (expiresAt === null || expiresAt > now)
  sendAuthStateChanged(authenticated, expiresAt, currentUser)
}

/**
 * Main message handler
 * Each case has its own try-catch for better error isolation
 * Inspired by old-workers/api-worker.ts:24-123
 */
self.onmessage = async (event: MessageEvent<MainToWorkerMessage>) => {
  const data = event.data
  switch (data.type) {
    case MSG.SETUP: {
      try {
        const payload = data.payload
        config = payload.config

        // Recreate provider from serialized code
        // Deserialize tất cả methods (bao gồm custom auth methods)
        const providerCode = payload.providerCode as unknown as Record<string, string>

        provider = {} as any

        // Deserialize tất cả methods
        for (const key in providerCode) {
          if (typeof providerCode[key] === 'string') {
            provider[key] = eval(`(${providerCode[key]})`)
          }
        }

        // Setup complete - worker is ready
        sendReady()
      } catch (error) {
        // Setup failed - send error via console (no id to send RESULT)
        console.error('[FetchGuard Worker] Setup failed:', error)
      }
      break
    }

    case MSG.FETCH: {
      const { id } = data
      try {
        const { url, options } = data.payload
        // manage AbortController for CANCEL support
        const controller = new AbortController()
        pendingControllers.set(id, controller)
        const merged: RequestInit = { ...(options || {}), signal: controller.signal }
        const result = await makeApiRequest(url, merged)

        // Send FETCH_RESULT or FETCH_ERROR based on result
        if (result.isOk()) {
          const response = result.data as { body: string; status: number; headers?: Record<string, string> }
          sendFetchResult(id, response.status, response.body, response.headers)
        } else {
          const error = result.errors?.[0]
          const message = error?.message || 'Unknown error'
          const status = result.status
          sendFetchError(id, message, status)
        }

        pendingControllers.delete(id)
      } catch (error) {
        pendingControllers.delete(id)
        sendFetchError(id, error instanceof Error ? error.message : String(error), undefined)
      }
      break
    }

    case MSG.AUTH_CALL: {
      const { id, payload } = data
      try {
        const { method, args } = payload

        // Check if method exists on provider
        if (typeof provider[method] !== 'function') {
          sendResult(id, err(GeneralErrors.Unexpected({ message: `Method '${method}' not found on provider` })))
          break
        }

        // Call provider method dynamically
        const result = await provider[method](...args)
        if (result.isError()) { sendResult(id, result); break }

        const tokenInfo = result.data

        // Update tokens in memory (auto emit AUTH_STATE_CHANGED)
        setTokenState(tokenInfo)

        // Send result back - simple ACK
        sendResult(id, ok(undefined))
      } catch (error) {
        sendResult(id, err(GeneralErrors.Unexpected({ message: error instanceof Error ? error.message : String(error) })))
      }
      break
    }

    case MSG.CANCEL: {
      try {
        const { id } = data
        const controller = pendingControllers.get(id)
        if (controller) {
          controller.abort()
          pendingControllers.delete(id)
        }
      } catch (error) {
        // Cancel errors are not critical, just log if debug enabled
        if (config?.debug) {
          console.error('CANCEL error:', error)
        }
      }
      break
    }

    case MSG.PING: {
      const { id } = data
      try {
        const ts = data.payload?.timestamp ?? Date.now()
        sendPong(id, ts)
      } catch (error) {
        sendResult(id, err(GeneralErrors.Unexpected({ message: error instanceof Error ? error.message : String(error) })))
      }
      break
    }

    default: {
      const anyData: any = data
      sendResult(anyData.id, err(GeneralErrors.UnknownMessage({ message: `Unknown message type: ${String(anyData.type)}` })))
    }
  }
}

})() // End IIFE - Immediately Invoked Function Expression
