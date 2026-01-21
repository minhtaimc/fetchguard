/**
 * Test setup - Mock Web Worker environment
 */

import { vi } from 'vitest'

/**
 * Mock Worker class for testing
 * Simulates postMessage/onmessage communication
 */
export class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  private messageHandler: ((data: unknown) => void) | null = null

  constructor(_url: string | URL, _options?: WorkerOptions) {
    // Worker created
  }

  postMessage(data: unknown): void {
    // Forward to message handler if set
    if (this.messageHandler) {
      this.messageHandler(data)
    }
  }

  terminate(): void {
    this.onmessage = null
    this.onerror = null
    this.messageHandler = null
  }

  /**
   * Set handler for messages from main thread
   * Used in tests to intercept messages
   */
  setMessageHandler(handler: (data: unknown) => void): void {
    this.messageHandler = handler
  }

  /**
   * Simulate worker sending message back to main thread
   */
  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  /**
   * Simulate worker error
   */
  simulateError(message: string): void {
    if (this.onerror) {
      const event = new ErrorEvent('error', { message })
      this.onerror(event)
    }
  }
}

/**
 * Create mock fetch function
 */
export function createMockFetch(responses: Map<string, Response | Error> = new Map()) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()

    const response = responses.get(url)
    if (response instanceof Error) {
      throw response
    }
    if (response) {
      return response
    }

    // Default 200 response
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  })
}

/**
 * Create mock Response
 */
export function createMockResponse(
  body: unknown,
  options: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const { status = 200, headers = {} } = options

  return new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }
  )
}

/**
 * Setup global mocks
 */
export function setupGlobalMocks(): void {
  // Mock Worker constructor
  vi.stubGlobal('Worker', MockWorker)
}

/**
 * Cleanup global mocks
 */
export function cleanupGlobalMocks(): void {
  vi.unstubAllGlobals()
}
