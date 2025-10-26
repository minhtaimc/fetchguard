/// <reference lib="webworker" />

import type { WorkerConfig, ApiResponse, TokenProvider, FetchGuardRequestInit, ProviderPresetConfig } from './types'
import type { MainToWorkerMessage } from './messages'
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
import { sendAuthStateChanged, sendAuthCallResult, sendPong, sendReady, sendSetupError, sendError, sendFetchResult, sendFetchError } from './worker-post'
import { getProvider } from './utils/registry'
import { buildProviderFromPreset } from './provider/register-presets'
import { deserializeFormData, isSerializedFormData } from './utils/formdata'
import { arrayBufferToBase64, isBinaryContentType } from './utils/binary'

/**
 * IIFE Closure to protect sensitive tokens from external access
 * Inspired by api-worker.js security pattern
 */
;(function () {
  let config: WorkerConfig | null = null
  let provider: TokenProvider | null = null
  let accessToken: string | null = null
  let refreshToken: string | null = null
  let expiresAt: number | null = null
  let currentUser: unknown | undefined
  const pendingControllers = new Map<string, AbortController>()
  let refreshPromise: Promise<void> | null = null

/**
 * Ensure we have a valid access token (not expired).
 * If token is missing or expired, refresh it.
 * Prevents concurrent refresh attempts.
 */
async function ensureValidToken(): Promise<Result<string | null>> {
  // Provider must be initialized via SETUP first
  if (!provider) {
    return err(InitErrors.NotInitialized())
  }

  if (accessToken && expiresAt) {
    const refreshEarlyMs = config?.refreshEarlyMs ?? DEFAULT_REFRESH_EARLY_MS
    const timeLeft = expiresAt - Date.now()
    if (timeLeft > refreshEarlyMs) {
      return ok(accessToken)
    }
  }

  if (refreshPromise) {
    await refreshPromise
    return ok(accessToken)
  }

  refreshPromise = (async () => {
    try {
      // Provider already checked above, TypeScript needs assertion
      if (!provider) {
        return
      }

      const valueRes = await provider.refreshToken(refreshToken)

      if (valueRes.isError()) {
        setTokenState({ token: null, expiresAt: null, user: undefined, refreshToken: undefined })
        return
      }

      const tokenInfo = valueRes.data
      if (!tokenInfo) {
        return
      }

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
async function makeApiRequest(url: string, options: FetchGuardRequestInit = {}): Promise<Result<ApiResponse>> {
  if (!config) {
    return err(InitErrors.NotInitialized())
  }

  if (!validateDomain(url)) {
    return err(DomainErrors.NotAllowed({ url }))
  }

  const requiresAuth = options.requiresAuth !== false
  const includeHeaders = options.includeHeaders === true
  // Extract FetchGuard-specific options and keep only standard RequestInit
  const { requiresAuth: _, includeHeaders: __, ...fetchOptions } = options

  // Deserialize FormData if present (inspired by api-worker.js:484-518)
  if (fetchOptions.body && isSerializedFormData(fetchOptions.body)) {
    fetchOptions.body = deserializeFormData(fetchOptions.body)
  }

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string> || {})
  }

  // Don't set Content-Type for FormData - browser will set it with boundary
  if (!headers['Content-Type'] && !headers['content-type'] && fetchOptions.body) {
    if (typeof fetchOptions.body === 'object' && !(fetchOptions.body instanceof FormData) && !(fetchOptions.body instanceof URLSearchParams)) {
      headers['Content-Type'] = 'application/json'
    }
  }

  if (requiresAuth) {
    const tokenRes = await ensureValidToken()
    if (tokenRes.isError()) {
      // Propagate error - cast to correct return type
      return err(tokenRes.errors)
    }

    const token = tokenRes.data
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  let response: Response
  try {
    response = await fetch(url, { ...fetchOptions, headers, credentials: 'include' })
  } catch (e) {
    const aborted = (e && (e as any).name === 'AbortError')
    return aborted
      ? err(RequestErrors.Cancelled())
      : err(NetworkErrors.NetworkError({ message: String(e) }))
  }

  // Extract content-type (always needed for binary detection)
  const contentType = response.headers.get('content-type') || 'application/octet-stream'

  // Determine if response is binary
  const isBinary = isBinaryContentType(contentType)

  // Get body as text or base64
  let body: string
  if (isBinary) {
    const buffer = await response.arrayBuffer()
    body = arrayBufferToBase64(buffer)
  } else {
    body = await response.text()
  }

  // Extract headers if requested
  const responseHeaders: Record<string, string> = {}
  if (includeHeaders) {
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })
  }

  return response.ok
    ? ok({ body, status: response.status, contentType, headers: responseHeaders })
    : err(NetworkErrors.HttpError({ message: `HTTP ${response.status}: ${body}` }))
}

/**
 * Update token state from TokenInfo and auto emit AUTH_STATE_CHANGED
 *
 * Smart update logic for ALL fields:
 * - Only update field if key exists in tokenInfo
 * - If key exists with value: update to that value (including null)
 * - If key doesn't exist: preserve existing value
 *
 * This allows flexible custom auth methods:
 * - Standard login/refresh: returns { token, user, expiresAt }
 * - Update user info: may only return { user: {...} } (no token change)
 * - Verify OTP: may return {} (just validation, no state change)
 * - Logout: returns { token: null, user: null, ... } to clear all
 */
function setTokenState(tokenInfo: { token?: string | null; expiresAt?: number | null; user?: unknown; refreshToken?: string | null }, emitEvent: boolean = true) {
  // Apply smart preservation to ALL fields
  if ('token' in tokenInfo) {
    accessToken = tokenInfo.token ?? null
  }

  if ('expiresAt' in tokenInfo) {
    expiresAt = tokenInfo.expiresAt ?? null
  }

  if ('user' in tokenInfo) {
    currentUser = tokenInfo.user
  }

  if ('refreshToken' in tokenInfo) {
    refreshToken = tokenInfo.refreshToken ?? null
  }

  if (emitEvent) {
    postAuthChanged()
  }
}

/**
 * Emit AUTH_STATE_CHANGED event based on current state
 * authenticated = true if we have valid non-expired token
 */
function postAuthChanged() {
  const now = Date.now()
  const authenticated = accessToken !== null && accessToken !== '' && (expiresAt === null || expiresAt > now)
  sendAuthStateChanged({
    authenticated,
    expiresAt,
    user: currentUser
  })
}

/**
 * Main message handler
 * Each case has its own try-catch for better error isolation
 */
self.onmessage = async (event: MessageEvent<MainToWorkerMessage>) => {
  const data = event.data
  switch (data.type) {
    case MSG.SETUP: {
      try {
        const payload = data.payload
        config = payload.config

        const providerConfig = payload.providerConfig

        // Build provider from config
        if (typeof providerConfig === 'string') {
          // Registry lookup
          provider = getProvider(providerConfig)
        } else if (providerConfig && typeof providerConfig === 'object' && 'type' in providerConfig) {
          // ProviderPresetConfig object
          provider = buildProviderFromPreset(providerConfig as ProviderPresetConfig)
        } else {
          sendSetupError('Invalid provider config')
          break
        }

        // Validate provider was successfully created
        if (!provider) {
          sendSetupError('Provider initialization failed - provider is null')
          break
        }

        sendReady()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[FetchGuard Worker] Setup failed:', errorMessage)
        sendSetupError(errorMessage)
      }
      break
    }

    case MSG.FETCH: {
      const { id } = data
      try {
        const { url, options } = data.payload
        const controller = new AbortController()
        pendingControllers.set(id, controller)
        const merged: RequestInit = { ...(options || {}), signal: controller.signal }
        const result = await makeApiRequest(url, merged)

        if (result.isOkWithData()) {
          sendFetchResult(id, result.data)
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
        const { method, args, emitEvent } = payload
        const shouldEmitEvent = emitEvent ?? true // Default: emit event

        if (!provider) {
          sendError(id, err(InitErrors.NotInitialized()))
          break
        }

        if (typeof provider[method] !== 'function') {
          sendError(id, err(GeneralErrors.Unexpected({ message: `Method '${method}' not found on provider` })))
          break
        }

        const result = await provider[method](...args)
        if (result.isError()) {
          sendError(id, result)
          break
        }

        const tokenInfo = result.data
        if (!tokenInfo) {
          sendError(id, err(GeneralErrors.Unexpected({ message: 'Provider returned null token info' })))
          break
        }

        // Update token state and optionally emit event
        setTokenState(tokenInfo, shouldEmitEvent)

        // Always send AuthResult back
        const now = Date.now()
        const authenticated =
          accessToken !== null && accessToken !== '' && (expiresAt === null || expiresAt > now)

        sendAuthCallResult(id, {
          authenticated,
          expiresAt,
          user: currentUser
        })
      } catch (error) {
        sendError(id, err(GeneralErrors.Unexpected({ message: error instanceof Error ? error.message : String(error) })))
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
        // Silently ignore cancel errors
      }
      break
    }

    case MSG.PING: {
      const { id } = data
      try {
        const ts = data.payload?.timestamp ?? Date.now()
        sendPong(id, ts)
      } catch (error) {
        sendError(id, err(GeneralErrors.Unexpected({ message: error instanceof Error ? error.message : String(error) })))
      }
      break
    }

    default: {
      const anyData: any = data
      sendError(anyData.id, err(GeneralErrors.UnknownMessage({ message: `Unknown message type: ${String(anyData.type)}` })))
    }
  }
}

})() // End IIFE - Immediately Invoked Function Expression
