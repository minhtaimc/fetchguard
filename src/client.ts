import type {
  FetchGuardOptions,
  FetchGuardRequestInit,
  WorkerConfig,
  ApiResponse,
  ProviderPresetConfig,
  AuthResult
} from './types'
import { fromJSON, ok, err, type Result } from 'ts-micro-result'
import { MSG } from './messages'
import {
  DEFAULT_REFRESH_EARLY_MS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_DELAY_MS
} from './constants'
import { GeneralErrors, NetworkErrors } from './errors'
import { serializeFormData, isFormData } from './utils/formdata'

/**
 * Queue item for sequential message processing
 * Inspired by old-workers/ApiWorkerService.ts
 */
interface QueueItem {
  id: string
  message: any
  resolve: (response: any) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * FetchGuard Client - main interface cho việc gọi API thông qua Web Worker
 */
export class FetchGuardClient {
  private worker: Worker
  private messageId = 0
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void
    reject: (error: Error) => void
  }>()
  private authListeners = new Set<(state: AuthResult) => void>()
  private readyListeners = new Set<() => void>()
  private isReady = false

  private requestQueue: QueueItem[] = []
  private isProcessingQueue = false
  private queueTimeout = 30000 // 30 seconds
  private setupResolve?: () => void
  private setupReject?: (error: Error) => void

  constructor(options: FetchGuardOptions) {
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
      debug: options.debug || false,
      refreshEarlyMs: options.refreshEarlyMs ?? DEFAULT_REFRESH_EARLY_MS,
      defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      retryCount: options.retryCount ?? DEFAULT_RETRY_COUNT,
      retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
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
      }, 10000)
    })
  }


  /**
   * Handle worker messages
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const { id, type, payload } = event.data

    if (type === MSG.FETCH_RESULT || type === MSG.FETCH_ERROR) {
      const request = this.pendingRequests.get(id)
      if (!request) return

      this.pendingRequests.delete(id)

      if (type === MSG.FETCH_RESULT) {
        const status = payload?.status ?? 200
        const headers = payload?.headers ?? {}
        const body = String(payload?.body ?? '')
        let data: any
        try { data = JSON.parse(body) } catch { data = body }
        request.resolve(ok<ApiResponse>({ data, status, headers }))
        return
      }

      if (type === MSG.FETCH_ERROR) {
        const status = typeof payload?.status === 'number' ? payload.status : undefined
        if (typeof status === 'number') {
          request.resolve(err(NetworkErrors.HttpError({ message: String(payload?.error || 'HTTP error') }), undefined, status))
        } else {
          request.resolve(err(NetworkErrors.NetworkError({ message: String(payload?.error || 'Network error') })))
        }
        return
      }
    }

    if (type === MSG.RESULT) {
      const request = this.pendingRequests.get(id)
      if (!request) return

      this.pendingRequests.delete(id)

      if (payload && payload.result) {
        try {
          const result = fromJSON(JSON.stringify(payload.result))
          request.resolve(result)
        } catch (e) {
          request.resolve(err(GeneralErrors.ResultParse({ message: String(e) })))
        }
      }
      return
    }

    if (type === MSG.READY) {
      this.isReady = true

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
        request.resolve(ok(payload)) // payload is AuthResult
      }
      return
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Worker error:', error)
    // Reject all pending requests
    for (const [id, request] of this.pendingRequests) {
      request.reject(new Error(`Worker error: ${error.message}`))
    }
    this.pendingRequests.clear()
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${++this.messageId}_${Date.now()}`
  }

  /**
   * Make API request
   */
  async fetch(url: string, options: FetchGuardRequestInit = {}): Promise<Result<ApiResponse>> {
    const { result } = this.fetchWithId(url, options)
    return result
  }

  /**
   * Fetch with id for external cancellation
   * Returns { id, result, cancel }
   * Now uses queue system for sequential processing
   */
  fetchWithId(url: string, options: FetchGuardRequestInit = {}): {
    id: string
    result: Promise<Result<ApiResponse>>
    cancel: () => void
  } {
    const id = this.generateMessageId()

    // Serialize FormData if present (async operation)
    const result = new Promise<Result<ApiResponse>>(async (resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (response) => resolve(response),
        reject: (error) => reject(error)
      })

      try {
        let serializedOptions = { ...options }

        // Serialize FormData body before sending to worker
        if (options.body && isFormData(options.body)) {
          const serializedBody = await serializeFormData(options.body)
          serializedOptions.body = serializedBody as any
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

        await this.sendMessageQueued(message, 30000)
      } catch (error) {
        const request = this.pendingRequests.get(id)
        if (request) {
          this.pendingRequests.delete(id)
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
      this.pendingRequests.delete(id)
      this.worker.postMessage({ id, type: MSG.CANCEL })
      request.reject(new Error('Request cancelled'))
    }
  }

  /**
   * Convenience methods
   */
  async get(url: string, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<ApiResponse>> {
    return this.fetch(url, { ...options, method: 'GET' })
  }

  async post(url: string, body?: any, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<ApiResponse>> {
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

  async put(url: string, body?: any, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<ApiResponse>> {
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

  async delete(url: string, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<ApiResponse>> {
    return this.fetch(url, { ...options, method: 'DELETE' })
  }

  async patch(url: string, body?: any, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<ApiResponse>> {
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

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (r: any) => resolve(r),
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
   * @param emitEvent - Whether to emit AUTH_STATE_CHANGED event (default: true)
   */
  async login(payload?: unknown, emitEvent: boolean = true): Promise<Result<AuthResult>> {
    const args = typeof payload === 'undefined' ? [] : [payload]
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

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (r: any) => resolve(r),
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
   */
  private sendMessageQueued<T = any>(message: any, timeoutMs: number = this.queueTimeout): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.requestQueue.findIndex(item => item.id === message.id)
        if (index !== -1) {
          this.requestQueue.splice(index, 1)
        }
        this.pendingRequests.delete(message.id)
        reject(new Error('Request timeout'))
      }, timeoutMs)

      const queueItem: QueueItem = {
        id: message.id,
        message,
        resolve,
        reject,
        timeout
      }

      this.requestQueue.push(queueItem)

      this.processQueue()
    })
  }

  /**
   * Process message queue sequentially
   * Benefits:
   * - Sequential processing prevents worker overload
   * - Better error isolation (one failure doesn't affect others)
   * - 50ms delay between requests for backpressure
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return
    }

    this.isProcessingQueue = true

    while (this.requestQueue.length > 0) {
      const item = this.requestQueue.shift()
      if (!item) continue

      try {
        this.worker.postMessage(item.message)

        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (error) {
        clearTimeout(item.timeout)
        item.reject(error instanceof Error ? error : new Error(String(error)))
      }
    }

    this.isProcessingQueue = false
  }

  /**
   * Cleanup - terminate worker
   */
  destroy(): void {
    this.worker.terminate()
    this.pendingRequests.clear()

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
