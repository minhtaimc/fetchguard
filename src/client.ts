import type {
  FetchGuardOptions,
  FetchGuardRequestInit,
  WorkerConfig,
  ApiResponse,
  TokenProvider
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
import { getProvider } from './utils/registry'

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
  private authListeners = new Set<(state: { authenticated: boolean; expiresAt?: number | null; user?: unknown }) => void>()

  // Init once pattern - inspired by old-workers
  private initPromise: Promise<Result<any>> | null = null
  private initResult: Result<any> | null = null

  // Message queue system - inspired by old-workers
  // Sequential processing to prevent worker overload
  private requestQueue: QueueItem[] = []
  private isProcessingQueue = false
  private queueTimeout = 30000 // 30 seconds
  private setupResolve?: () => void
  private setupReject?: (error: Error) => void

  constructor(options: FetchGuardOptions) {
    // Tạo worker
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { 
      type: 'module' 
    })

    // Setup message handler
    this.worker.onmessage = this.handleWorkerMessage.bind(this)
    this.worker.onerror = this.handleWorkerError.bind(this)

    // Initialize worker
    this.initializeWorker(options)
  }

  /**
   * Initialize worker với config và provider
   */
  private async initializeWorker(options: FetchGuardOptions): Promise<void> {
    const provider = typeof options.provider === 'string'
      ? getProvider(options.provider)
      : options.provider

    const config: WorkerConfig = {
      baseUrl: options.baseUrl || '',
      allowedDomains: options.allowedDomains || [],
      debug: options.debug || false,
      refreshEarlyMs: options.refreshEarlyMs ?? DEFAULT_REFRESH_EARLY_MS,
      defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      retryCount: options.retryCount ?? DEFAULT_RETRY_COUNT,
      retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    }

    // Serialize provider functions
    const providerCode = this.serializeProvider(provider)

    const message = {
      id: this.generateMessageId(),
      type: MSG.SETUP,
      payload: {
        config,
        providerCode
      }
    }

    return new Promise((resolve, reject) => {
      // Setup will respond with READY (no id, so we track separately)
      this.setupResolve = resolve
      this.setupReject = reject

      // Send SETUP message
      this.worker.postMessage(message)

      // Timeout after 10 seconds
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
   * Serialize provider functions để gửi qua worker
   * Serialize tất cả methods của provider (bao gồm custom auth methods)
   */
  private serializeProvider(provider: TokenProvider): Record<string, string> {
    const serialized: Record<string, string> = {}

    // Serialize tất cả methods của provider
    for (const key in provider) {
      if (typeof provider[key] === 'function') {
        serialized[key] = provider[key].toString()
      }
    }

    return serialized
  }

  /**
   * Handle worker messages
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const { id, type, payload } = event.data

    // Handle FETCH responses
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

    // Handle RESULT messages (for INIT, LOGIN, LOGOUT, etc.)
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
      // Worker setup complete
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

    // Create the message
    const message = { id, type: MSG.FETCH, payload: { url, options } }

    // Set up pending request handler
    const result = new Promise<Result<ApiResponse>>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (response) => resolve(response),
        reject: (error) => reject(error)
      })
    })

    // Queue the message for sequential processing
    this.sendMessageQueued(message, 30000).catch((error) => {
      // If queue times out, also reject the result promise
      const request = this.pendingRequests.get(id)
      if (request) {
        this.pendingRequests.delete(id)
        request.reject(error)
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
    return this.fetch(url, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  async put(url: string, body?: any, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<ApiResponse>> {
    return this.fetch(url, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  async delete(url: string, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<ApiResponse>> {
    return this.fetch(url, { ...options, method: 'DELETE' })
  }

  async patch(url: string, body?: any, options: Omit<FetchGuardRequestInit, 'method' | 'body'> = {}): Promise<Result<ApiResponse>> {
    return this.fetch(url, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined
    })
  }

  /**
   * Generic method to call any auth method on provider
   * @param method - Method name (login, logout, loginWithPhone, etc.)
   * @param args - Arguments to pass to the method
   * @returns Result with success (auth state changes emitted via AUTH_STATE_CHANGED event)
   */
  async call(method: string, ...args: unknown[]): Promise<Result<void>> {
    const id = this.generateMessageId()
    const message = { id, type: MSG.AUTH_CALL, payload: { method, args } }

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
   * Note: Auth state changes are emitted via onAuthStateChanged event
   */
  async login(payload?: unknown): Promise<Result<void>> {
    return this.call('login', payload)
  }

  /**
   * Convenience wrapper for logout
   * Note: Auth state changes are emitted via onAuthStateChanged event
   */
  async logout(payload?: unknown): Promise<Result<void>> {
    return this.call('logout', payload)
  }

  onAuthStateChanged(cb: (state: { authenticated: boolean; expiresAt?: number | null; user?: unknown }) => void): () => void {
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
        // Remove from queue if still there
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

      // Add to queue
      this.requestQueue.push(queueItem)

      // Start processing queue if not already processing
      this.processQueue()
    })
  }

  /**
   * Process message queue sequentially
   * Inspired by old-workers/ApiWorkerService.ts:227-271
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
        // Send message to worker
        this.worker.postMessage(item.message)

        // Wait for response (handled by handleWorkerMessage)
        // Response will be resolved via the pending request

        // Add 50ms delay between requests to prevent worker overload
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (error) {
        // Clear timeout and reject on error
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

    // Clear all queued items
    for (const item of this.requestQueue) {
      clearTimeout(item.timeout)
      item.reject(new Error('Client destroyed'))
    }
    this.requestQueue = []
  }
}

/**
 * Factory function để tạo FetchGuard client
 */
export function createClient(options: FetchGuardOptions): FetchGuardClient {
  return new FetchGuardClient(options)
}

