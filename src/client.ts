import type {
  FetchGuardOptions,
  FetchGuardRequestInit,
  WorkerConfig,
  FetchEnvelope,
  ProviderPresetConfig,
  AuthResult,
  DebugHooks,
  RetryConfig,
  NetworkErrorDetail,
  DedupeConfig,
  RequestMetrics
} from './types'
import type { MainToWorkerMessage } from './messages'
import { ok, err, type Result } from 'ts-micro-result'
import { MSG } from './messages'
import { DEFAULT_REFRESH_EARLY_MS } from './constants'
import { RequestErrors } from './errors'
import { serializeFormData, isFormData } from './utils/formdata'

/**
 * Request timing data for metrics calculation
 */
interface RequestTiming {
  /** When request was created (before queue) */
  createdAt: number
  /** When request was sent to worker (after queue) */
  sentAt?: number
}

/**
 * Queue item for sequential message processing
 */
interface QueueItem {
  id: string
  message: MainToWorkerMessage
  /** Transferable objects for zero-copy postMessage (e.g., ArrayBuffers from FormData) */
  transferables?: Transferable[]
  resolve: (response: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/** Default max concurrent requests */
const DEFAULT_MAX_CONCURRENT = 6

/** Default max queue size */
const DEFAULT_MAX_QUEUE_SIZE = 1000

/** Default setup timeout (ms) */
const DEFAULT_SETUP_TIMEOUT = 10000

/** Default request timeout (ms) */
const DEFAULT_REQUEST_TIMEOUT = 30000

/**
 * FetchGuard Client - main interface cho việc gọi API thông qua Web Worker
 */
export class FetchGuardClient {
  private worker: Worker
  private messageId = 0
  // Using unknown because different messages have different response types
  // (FetchEnvelope for FETCH, AuthResult for AUTH_CALL, etc.)
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  /** Track request URLs for debug hooks */
  private requestUrls = new Map<string, string>()
  /** Track request timing for metrics */
  private requestTimings = new Map<string, RequestTiming>()
  private authListeners = new Set<(state: AuthResult) => void>()
  private readyListeners = new Set<() => void>()
  private isReady = false

  private requestQueue: QueueItem[] = []
  private activeRequests = 0
  private readonly maxConcurrent: number
  private readonly maxQueueSize: number
  private readonly setupTimeout: number
  private readonly requestTimeout: number
  private setupResolve?: () => void
  private setupReject?: (error: Error) => void
  private readonly debug?: DebugHooks
  private readonly retry?: RetryConfig
  private readonly dedupe?: DedupeConfig
  /** In-flight requests for deduplication */
  private readonly inFlightRequests = new Map<string, Promise<Result<FetchEnvelope>>>()
  /** Recent completed requests for time-window deduplication */
  private readonly recentResults = new Map<string, { result: Result<FetchEnvelope>; timestamp: number }>()

  constructor(options: FetchGuardOptions) {
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE
    this.setupTimeout = options.setupTimeout ?? DEFAULT_SETUP_TIMEOUT
    this.requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT
    this.debug = options.debug
    this.retry = options.retry
    this.dedupe = options.dedupe
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { 
      type: 'module' 
    })

    this.worker.onmessage = this.handleWorkerMessage.bind(this)
    this.worker.onerror = this.handleWorkerError.bind(this)

    this.initializeWorker(options)
  }

  /**
   * Initialize worker with config and provider
   */
  private async initializeWorker(options: FetchGuardOptions): Promise<void> {
    const config: WorkerConfig = {
      allowedDomains: options.allowedDomains || [],
      refreshEarlyMs: options.refreshEarlyMs ?? DEFAULT_REFRESH_EARLY_MS,
      defaultHeaders: options.defaultHeaders || {}
    }

    // Serialize provider config based on type
    let providerConfig: ProviderPresetConfig | string | null = null

    if (typeof options.provider === 'string') {
      // String = registry lookup (advanced usage)
      providerConfig = options.provider
    } else if ('type' in options.provider && options.provider.type) {
      // ProviderPresetConfig object (recommended)
      providerConfig = options.provider as ProviderPresetConfig
    } else {
      // TokenProvider instance - NOT SUPPORTED
      throw new Error(
        'Direct TokenProvider instance is not supported. Use ProviderPresetConfig instead:\n' +
        '  { type: "cookie-auth", refreshUrl: "...", loginUrl: "...", logoutUrl: "..." }\n' +
        'Or for custom providers, register in worker code and use string name.'
      )
    }

    const message = {
      id: this.generateMessageId(),
      type: MSG.SETUP,
      payload: {
        config,
        providerConfig
      }
    }

    return new Promise((resolve, reject) => {
      // Setup will respond with READY (no id, so we track separately)
      this.setupResolve = resolve
      this.setupReject = reject

      this.worker.postMessage(message)

      setTimeout(() => {
        if (this.setupReject) {
          this.setupReject(new Error('Worker setup timeout'))
          this.setupResolve = undefined
          this.setupReject = undefined
        }
      }, this.setupTimeout)
    })
  }


  /**
   * Handle worker messages
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const { id, type, payload } = event.data

    if (type === MSG.FETCH_RESULT) {
      // FETCH_RESULT contains FetchEnvelope (raw HTTP response)
      // Worker doesn't judge HTTP status - client receives envelope as-is
      const request = this.pendingRequests.get(id)
      if (!request) return

      const url = this.requestUrls.get(id)
      const timing = this.requestTimings.get(id)
      this.pendingRequests.delete(id)
      this.requestUrls.delete(id)
      this.requestTimings.delete(id)
      this.onRequestComplete()

      // Calculate metrics
      const metrics = this.calculateMetrics(timing)

      // Debug hook: onResponse
      if (this.debug?.onResponse && url) {
        this.debug.onResponse(url, payload as FetchEnvelope, metrics)
      }

      request.resolve(ok(payload as FetchEnvelope))
      return
    }

    if (type === MSG.FETCH_ERROR) {
      // Network/timeout/cancel errors (no HTTP response)
      const request = this.pendingRequests.get(id)
      if (!request) return

      const url = this.requestUrls.get(id)
      const timing = this.requestTimings.get(id)
      this.pendingRequests.delete(id)
      this.requestUrls.delete(id)
      this.requestTimings.delete(id)
      this.onRequestComplete()

      const errorMessage = String(payload?.error || 'Network error')

      // Calculate metrics
      const metrics = this.calculateMetrics(timing)

      // Debug hook: onError
      if (this.debug?.onError && url) {
        this.debug.onError(url, { code: 'NETWORK_ERROR', message: errorMessage }, metrics)
      }

      request.resolve(err(
        RequestErrors.NetworkError({ message: errorMessage })
      ))
      return
    }

    if (type === MSG.ERROR) {
      const request = this.pendingRequests.get(id)
      if (!request) return

      this.pendingRequests.delete(id)
      this.onRequestComplete()

      request.resolve(err(payload.errors, payload.meta))
      return
    }

    if (type === MSG.SETUP_ERROR) {
      // Setup failed - reject setup promise
      if (this.setupReject) {
        this.setupReject(new Error(`Worker setup failed: ${payload?.error || 'Unknown error'}`))
        this.setupResolve = undefined
        this.setupReject = undefined
      }
      return
    }

    if (type === MSG.READY) {
      this.isReady = true

      // Debug hook: onWorkerReady
      this.debug?.onWorkerReady?.()

      // Notify ready listeners
      for (const listener of this.readyListeners) {
        listener()
      }

      if (this.setupResolve) {
        this.setupResolve()
        this.setupResolve = undefined
        this.setupReject = undefined
      }
      return
    }

    if (type === MSG.PONG) {
      const request = this.pendingRequests.get(id)
      if (request) {
        this.pendingRequests.delete(id)
        this.onRequestComplete()
        request.resolve(ok({ timestamp: payload?.timestamp }))
      }
      return
    }

    if (type === MSG.AUTH_STATE_CHANGED) {
      for (const cb of this.authListeners) cb(payload)
      return
    }

    if (type === MSG.AUTH_CALL_RESULT) {
      const request = this.pendingRequests.get(id)
      if (request) {
        this.pendingRequests.delete(id)
        this.onRequestComplete()
        request.resolve(ok(payload)) // payload is AuthResult
      }
      return
    }

    if (type === MSG.TOKEN_REFRESHED) {
      // Debug hook: onRefresh
      this.debug?.onRefresh?.(payload?.reason)
      return
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Worker error:', error)

    // Debug hook: onWorkerError
    this.debug?.onWorkerError?.(error)

    // Reject all pending requests
    for (const [id, request] of this.pendingRequests) {
      request.reject(new Error(`Worker error: ${error.message}`))
    }
    this.pendingRequests.clear()
    this.requestUrls.clear()
    this.requestTimings.clear()
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${++this.messageId}_${Date.now()}`
  }

  /**
   * Make API request with optional deduplication, retry, and AbortSignal support
   *
   * @param url - Full URL to fetch
   * @param options - Request options including optional AbortSignal
   * @returns Result with FetchEnvelope on success, error on failure
   *
   * @example
   * // With AbortSignal
   * const controller = new AbortController()
   * setTimeout(() => controller.abort(), 5000)
   * const result = await api.fetch('/slow', { signal: controller.signal })
   */
  async fetch(url: string, options: FetchGuardRequestInit = {}): Promise<Result<FetchEnvelope>> {
    // Extract signal from options (not passed to worker - handled client-side)
    const { signal, ...restOptions } = options

    // Check if already aborted
    if (signal?.aborted) {
      return err(RequestErrors.Cancelled())
    }

    // Check for deduplication
    const dedupeKey = this.getDedupeKey(url, restOptions)
    if (dedupeKey) {
      // Check for in-flight request
      const inFlight = this.inFlightRequests.get(dedupeKey)
      if (inFlight) {
        // If we have a signal, wrap the in-flight promise to support cancellation
        if (signal) {
          return this.wrapWithAbortSignal(inFlight, signal, null)
        }
        return inFlight
      }

      // Check for recent result within time window
      const window = this.dedupe?.window ?? 0
      if (window > 0) {
        const recent = this.recentResults.get(dedupeKey)
        if (recent && Date.now() - recent.timestamp < window) {
          return recent.result
        }
      }

      // Create deduped request
      const promise = this.fetchWithRetryAndSignal(url, restOptions, signal ?? undefined)
      this.inFlightRequests.set(dedupeKey, promise)

      try {
        const result = await promise
        // Store result for time-window deduplication
        if (window > 0) {
          this.recentResults.set(dedupeKey, { result, timestamp: Date.now() })
          // Clean up old results after window expires
          setTimeout(() => this.recentResults.delete(dedupeKey), window)
        }
        return result
      } finally {
        this.inFlightRequests.delete(dedupeKey)
      }
    }

    // No deduplication - just fetch with retry and signal
    return this.fetchWithRetryAndSignal(url, restOptions, signal ?? undefined)
  }

  /**
   * Wrap a promise with AbortSignal support
   */
  private wrapWithAbortSignal(
    promise: Promise<Result<FetchEnvelope>>,
    signal: AbortSignal,
    requestId: string | null
  ): Promise<Result<FetchEnvelope>> {
    return new Promise((resolve) => {
      // Handle abort
      const abortHandler = () => {
        if (requestId) {
          this.cancel(requestId)
        }
        resolve(err(RequestErrors.Cancelled()))
      }

      if (signal.aborted) {
        abortHandler()
        return
      }

      signal.addEventListener('abort', abortHandler, { once: true })

      promise.then((result) => {
        signal.removeEventListener('abort', abortHandler)
        resolve(result)
      })
    })
  }

  /**
   * Fetch with retry logic and AbortSignal support (internal)
   */
  private async fetchWithRetryAndSignal(
    url: string,
    options: Omit<FetchGuardRequestInit, 'signal'>,
    signal?: AbortSignal
  ): Promise<Result<FetchEnvelope>> {
    const maxAttempts = this.retry?.maxAttempts ?? 0
    const delay = this.retry?.delay ?? 1000
    const backoff = this.retry?.backoff ?? 1
    const maxDelay = this.retry?.maxDelay ?? 30000
    const jitter = this.retry?.jitter ?? 0
    const shouldRetry = this.retry?.shouldRetry ?? this.defaultShouldRetry

    let lastResult: Result<FetchEnvelope> | null = null
    let currentDelay = delay

    // Initial attempt + retries
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      // Check if aborted before each attempt
      if (signal?.aborted) {
        return err(RequestErrors.Cancelled())
      }

      const { id, result } = this.fetchWithId(url, options)

      // If we have a signal, wrap result with abort support
      if (signal) {
        lastResult = await this.wrapWithAbortSignal(result, signal, id)
      } else {
        lastResult = await result
      }

      // Success or HTTP error (4xx/5xx) - don't retry
      if (lastResult.ok) {
        return lastResult
      }

      // Check if cancelled
      if (lastResult.errors[0]?.code === 'REQUEST_CANCELLED') {
        return lastResult
      }

      // Check if we should retry this error
      const error = lastResult.errors[0]
      const errorDetail: NetworkErrorDetail = {
        code: error?.code as NetworkErrorDetail['code'] ?? 'NETWORK_ERROR',
        message: error?.message ?? 'Unknown error'
      }

      // Don't retry if:
      // - This was the last attempt
      // - Error is not retryable (e.g., cancelled)
      if (attempt >= maxAttempts || !shouldRetry(errorDetail)) {
        return lastResult
      }

      // Wait before retry (with exponential backoff and optional jitter)
      // Jitter only applies when shouldRetry=true (we're actually retrying)
      const cappedDelay = Math.min(currentDelay, maxDelay)
      const jitteredDelay = this.applyJitter(cappedDelay, jitter)

      // Check abort during delay
      if (signal) {
        const aborted = await this.sleepWithAbort(jitteredDelay, signal)
        if (aborted) {
          return err(RequestErrors.Cancelled())
        }
      } else {
        await this.sleep(jitteredDelay)
      }

      currentDelay = currentDelay * backoff
    }

    return lastResult!
  }

  /**
   * Generate deduplication key for request
   * Returns null if request should not be deduplicated
   */
  private getDedupeKey(url: string, options: FetchGuardRequestInit): string | null {
    if (!this.dedupe?.enabled) {
      return null
    }

    // Use custom key generator if provided
    if (this.dedupe.keyGenerator) {
      return this.dedupe.keyGenerator(url, options)
    }

    // Default: only dedupe GET requests by URL
    const method = (options.method ?? 'GET').toUpperCase()
    if (method !== 'GET') {
      return null
    }

    return `GET:${url}`
  }

  /**
   * Apply jitter to a delay value
   * Jitter adds ±(jitter * delay) randomness to prevent thundering herd
   * @param delay - Base delay in milliseconds
   * @param jitter - Jitter factor (0-1)
   * @returns Jittered delay
   */
  private applyJitter(delay: number, jitter: number): number {
    if (jitter <= 0) return delay
    // Clamp jitter to valid range [0, 1]
    const clampedJitter = Math.min(Math.max(jitter, 0), 1)
    // Random value between -1 and 1
    const randomFactor = (Math.random() * 2) - 1
    // Apply jitter: delay ± (delay * jitter * random)
    return Math.max(0, delay + (delay * clampedJitter * randomFactor))
  }

  /**
   * Default retry condition - only retry on NETWORK_ERROR
   */
  private defaultShouldRetry(error: NetworkErrorDetail): boolean {
    // Don't retry cancelled requests or parse errors
    return error.code === 'NETWORK_ERROR'
  }

  /**
   * Calculate request metrics from timing data
   */
  private calculateMetrics(timing?: RequestTiming): RequestMetrics | undefined {
    if (!timing) return undefined

    const endTime = Date.now()
    const startTime = timing.createdAt
    const sentAt = timing.sentAt ?? startTime
    const duration = endTime - startTime
    const queueTime = sentAt - startTime
    const ipcTime = duration - queueTime // Approximate: total - queue = IPC + server

    return {
      startTime,
      endTime,
      duration,
      queueTime,
      ipcTime
    }
  }

  /**
   * Sleep helper for retry delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Sleep with abort signal support
   * Returns true if aborted, false if completed normally
   */
  private sleepWithAbort(ms: number, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve(true)
        return
      }

      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abortHandler)
        resolve(false)
      }, ms)

      const abortHandler = () => {
        clearTimeout(timer)
        resolve(true)
      }

      signal.addEventListener('abort', abortHandler, { once: true })
    })
  }

  /**
   * Fetch with id for external cancellation
   * Returns { id, result, cancel }
   * Now uses queue system for sequential processing
   */
  fetchWithId(url: string, options: FetchGuardRequestInit = {}): {
    id: string
    result: Promise<Result<FetchEnvelope>>
    cancel: () => void
  } {
    const id = this.generateMessageId()

    // Serialize FormData if present (async operation)
    const result = new Promise<Result<FetchEnvelope>>(async (resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (response) => resolve(response as Result<FetchEnvelope>),
        reject: (error) => reject(error)
      })
      // Track URL for debug hooks
      this.requestUrls.set(id, url)
      // Track timing for metrics
      this.requestTimings.set(id, { createdAt: Date.now() })

      // Debug hook: onRequest
      this.debug?.onRequest?.(url, options)

      try {
        let serializedOptions = { ...options }
        let transferables: Transferable[] | undefined

        // Serialize FormData body before sending to worker
        if (options.body && isFormData(options.body)) {
          const { data, transferables: formDataTransferables } = await serializeFormData(options.body)
          // SerializedFormData will be deserialized back to FormData in worker
          serializedOptions.body = data as unknown as BodyInit
          // ArrayBuffers for zero-copy transfer
          if (formDataTransferables.length > 0) {
            transferables = formDataTransferables
          }
        }

        // Serialize Headers object to plain object (Headers cannot be cloned)
        if (options.headers) {
          if (options.headers instanceof Headers) {
            const plainHeaders: Record<string, string> = {}
            options.headers.forEach((value, key) => {
              plainHeaders[key] = value
            })
            serializedOptions.headers = plainHeaders
          }
        }

        const message = { id, type: MSG.FETCH, payload: { url, options: serializedOptions } }

        await this.sendMessageQueued(message, 30000, transferables)
      } catch (error) {
        const request = this.pendingRequests.get(id)
        if (request) {
          this.pendingRequests.delete(id)
          this.requestUrls.delete(id)
          this.requestTimings.delete(id)
          request.reject(error instanceof Error ? error : new Error(String(error)))
        }
      }
    })

    const cancel = () => this.cancel(id)

    return { id, result, cancel }
  }

  /**
   * Cancel a pending request by ID
   */
  cancel(id: string): void {
    const request = this.pendingRequests.get(id)
    if (request) {
      const url = this.requestUrls.get(id)
      const timing = this.requestTimings.get(id)
      this.pendingRequests.delete(id)
      this.requestUrls.delete(id)
      this.requestTimings.delete(id)
      this.worker.postMessage({ id, type: MSG.CANCEL })

      // Calculate metrics
      const metrics = this.calculateMetrics(timing)

      // Debug hook: onError for cancelled request
      if (this.debug?.onError && url) {
        this.debug.onError(url, { code: 'REQUEST_CANCELLED', message: 'Request cancelled' }, metrics)
      }

      request.reject(new Error('Request cancelled'))
    }
  }

  /**
   * Convenience methods
   */
  async get(url: string, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<FetchEnvelope>> {
    return this.fetch(url, { ...options, method: 'GET' })
  }

  async post(url: string, body?: unknown, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<FetchEnvelope>> {
    // If body is FormData, use fetch directly (no JSON.stringify)
    if (body && isFormData(body)) {
      return this.fetch(url, {
        ...options,
        method: 'POST',
        body
      })
    }

    // For non-FormData body, use JSON
    const headers = new Headers(options.headers)

    // Set Content-Type if not already set and body is being stringified
    if (body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return this.fetch(url, {
      ...options,
      headers,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  async put(url: string, body?: unknown, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<FetchEnvelope>> {
    // If body is FormData, use fetch directly (no JSON.stringify)
    if (body && isFormData(body)) {
      return this.fetch(url, {
        ...options,
        method: 'PUT',
        body
      })
    }

    // For non-FormData body, use JSON
    const headers = new Headers(options.headers)

    // Set Content-Type if not already set and body is being stringified
    if (body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return this.fetch(url, {
      ...options,
      headers,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  async delete(url: string, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<FetchEnvelope>> {
    return this.fetch(url, { ...options, method: 'DELETE' })
  }

  async patch(url: string, body?: unknown, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<FetchEnvelope>> {
    // If body is FormData, use fetch directly (no JSON.stringify)
    if (body && isFormData(body)) {
      return this.fetch(url, {
        ...options,
        method: 'PATCH',
        body
      })
    }

    // For non-FormData body, use JSON
    const headers = new Headers(options.headers)

    // Set Content-Type if not already set and body is being stringified
    if (body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return this.fetch(url, {
      ...options,
      headers,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  /**
   * Generic method to call any auth method on provider
   * @param method - Method name (login, logout, loginWithPhone, etc.)
   * @param emitEvent - Whether to emit AUTH_STATE_CHANGED event (default: true)
   * @param args - Arguments to pass to the method
   * @returns Promise<Result<AuthResult>> - Always returns AuthResult
   */
  async call(method: string, emitEvent?: boolean, ...args: unknown[]): Promise<Result<AuthResult>> {
    const id = this.generateMessageId()
    const message = { id, type: MSG.AUTH_CALL, payload: { method, args, emitEvent } }

    return new Promise<Result<AuthResult>>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (r) => resolve(r as Result<AuthResult>),
        reject: (e: Error) => reject(e)
      })

      this.sendMessageQueued(message, 15000).catch((error) => {
        const request = this.pendingRequests.get(id)
        if (request) {
          this.pendingRequests.delete(id)
          request.reject(error)
        }
      })
    })
  }


  /**
   * Convenience wrapper for login
   * @param payload - Login credentials
   * @param url - Optional URL override
   * @param emitEvent - Whether to emit AUTH_STATE_CHANGED event (default: true)
   */
  async login(payload?: unknown, url?: string, emitEvent: boolean = true): Promise<Result<AuthResult>> {
    const args: unknown[] = []
    if (typeof payload !== 'undefined') {
      args.push(payload)
    }
    if (typeof url !== 'undefined') {
      // If payload is undefined but url is provided, need to pass undefined explicitly
      if (args.length === 0) {
        args.push(undefined)
      }
      args.push(url)
    }
    return this.call('login', emitEvent, ...args)
  }

  /**
   * Convenience wrapper for logout
   * @param payload - Optional logout payload
   * @param emitEvent - Whether to emit AUTH_STATE_CHANGED event (default: true)
   */
  async logout(payload?: unknown, emitEvent: boolean = true): Promise<Result<AuthResult>> {
    const args = typeof payload === 'undefined' ? [] : [payload]
    return this.call('logout', emitEvent, ...args)
  }

  /**
   * Convenience wrapper for refreshToken
   * @param emitEvent - Whether to emit AUTH_STATE_CHANGED event (default: true)
   */
  async refreshToken(emitEvent: boolean = true): Promise<Result<AuthResult>> {
    return this.call('refreshToken', emitEvent)
  }

  /**
   * Check if worker is ready
   */
  ready(): boolean {
    return this.isReady
  }

  /**
   * Wait for worker to be ready
   * Returns immediately if already ready
   */
  async whenReady(): Promise<void> {
    if (this.isReady) return Promise.resolve()

    return new Promise<void>((resolve) => {
      this.readyListeners.add(resolve)
    })
  }

  /**
   * Subscribe to ready event
   * Callback is called immediately if already ready
   */
  onReady(callback: () => void): () => void {
    if (this.isReady) {
      // Already ready - call immediately
      callback()
    }

    this.readyListeners.add(callback)

    // Return unsubscribe function
    return () => {
      this.readyListeners.delete(callback)
    }
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChanged(cb: (state: AuthResult) => void): () => void {
    this.authListeners.add(cb)
    return () => this.authListeners.delete(cb)
  }

  /** Send PING and await PONG */
  async ping(): Promise<Result<{ timestamp: number }>> {
    const id = this.generateMessageId()
    const message = { id, type: MSG.PING, payload: { timestamp: Date.now() } }

    return new Promise<Result<{ timestamp: number }>>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (r) => resolve(r as Result<{ timestamp: number }>),
        reject: (e: Error) => reject(e)
      })

      this.sendMessageQueued(message, 5000).catch((error) => {
        const request = this.pendingRequests.get(id)
        if (request) {
          this.pendingRequests.delete(id)
          request.reject(error)
        }
      })
    })
  }


  /**
   * Send message through queue system
   * All messages go through queue for sequential processing
   * @param transferables - Optional Transferable objects for zero-copy postMessage
   */
  private sendMessageQueued<T = unknown>(
    message: MainToWorkerMessage,
    timeoutMs: number = this.requestTimeout,
    transferables?: Transferable[]
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Check queue size limit to prevent memory leak
      if (this.requestQueue.length >= this.maxQueueSize) {
        reject(err(RequestErrors.QueueFull({ size: this.requestQueue.length, maxSize: this.maxQueueSize })))
        return
      }

      const timeout = setTimeout(() => {
        const index = this.requestQueue.findIndex(item => item.id === message.id)
        if (index !== -1) {
          this.requestQueue.splice(index, 1)
        }
        this.pendingRequests.delete(message.id)
        this.requestUrls.delete(message.id)
        this.requestTimings.delete(message.id)
        reject(err(RequestErrors.Timeout()))
      }, timeoutMs)

      const queueItem: QueueItem = {
        id: message.id,
        message,
        transferables,
        resolve: resolve as (response: unknown) => void,
        reject,
        timeout
      }

      this.requestQueue.push(queueItem)

      this.processQueue()
    })
  }

  /**
   * Process message queue with concurrency limit
   *
   * Uses semaphore pattern to allow N concurrent requests.
   * Benefits:
   * - Higher throughput than sequential processing
   * - Backpressure via maxConcurrent limit
   * - Better error isolation (one failure doesn't affect others)
   */
  private processQueue(): void {
    // Process as many items as we can within concurrency limit
    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const item = this.requestQueue.shift()
      if (!item) continue

      this.activeRequests++

      // Update timing: mark when request is actually sent to worker
      const timing = this.requestTimings.get(item.id)
      if (timing) {
        timing.sentAt = Date.now()
      }

      try {
        // Use transferables for zero-copy transfer when available (e.g., FormData with files)
        if (item.transferables && item.transferables.length > 0) {
          this.worker.postMessage(item.message, item.transferables)
        } else {
          this.worker.postMessage(item.message)
        }
        // Note: activeRequests is decremented when response is received
        // in handleWorkerMessage, not here
      } catch (error) {
        this.activeRequests--
        clearTimeout(item.timeout)
        item.reject(error instanceof Error ? error : new Error(String(error)))
        // Continue processing queue after error
        this.processQueue()
      }
    }
  }

  /**
   * Called when a request completes (success or error)
   * Decrements active count and processes next items in queue
   */
  private onRequestComplete(): void {
    this.activeRequests--
    this.processQueue()
  }

  /**
   * Cleanup - terminate worker
   */
  destroy(): void {
    this.worker.terminate()
    this.pendingRequests.clear()
    this.requestUrls.clear()
    this.requestTimings.clear()

    for (const item of this.requestQueue) {
      clearTimeout(item.timeout)
      item.reject(new Error('Client destroyed'))
    }
    this.requestQueue = []
  }
}

/**
 * Factory function to create FetchGuard client
 */
export function createClient(options: FetchGuardOptions): FetchGuardClient {
  return new FetchGuardClient(options)
}
