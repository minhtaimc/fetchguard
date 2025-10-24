/**
 * Test utilities for FetchGuard E2E tests
 */

/**
 * Mock fetch server for testing
 */
export class MockFetchServer {
  private handlers = new Map<string, (req: Request) => Promise<Response>>()
  private requestLog: Array<{ url: string; method: string; headers: Headers; body?: any }> = []

  /**
   * Mock global fetch
   */
  install(): void {
    const self = this
    globalThis.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method = init?.method || 'GET'
      const headers = new Headers(init?.headers)

      let body: any
      if (init?.body) {
        if (typeof init.body === 'string') {
          try {
            body = JSON.parse(init.body)
          } catch {
            body = init.body
          }
        } else {
          body = init.body
        }
      }

      // Log request
      self.requestLog.push({ url, method, headers, body })

      // Find handler
      const handler = self.handlers.get(`${method} ${url}`)
      if (!handler) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const request = new Request(url, {
        method,
        headers,
        body: init?.body
      })

      return handler(request)
    }
  }

  /**
   * Register a mock endpoint
   */
  on(method: string, url: string, handler: (req: Request) => Promise<Response>): void {
    this.handlers.set(`${method} ${url}`, handler)
  }

  /**
   * Helper to mock a JSON response
   */
  onJSON(method: string, url: string, statusOrHandler: number | ((req: Request) => any), data?: any): void {
    this.on(method, url, async (req) => {
      const status = typeof statusOrHandler === 'number' ? statusOrHandler : 200
      const responseData = typeof statusOrHandler === 'function' ? await statusOrHandler(req) : data

      return new Response(JSON.stringify(responseData), {
        status,
        headers: { 'Content-Type': 'application/json' }
      })
    })
  }

  /**
   * Get request log
   */
  getRequests(): Array<{ url: string; method: string; headers: Headers; body?: any }> {
    return this.requestLog
  }

  /**
   * Get last request
   */
  getLastRequest(): { url: string; method: string; headers: Headers; body?: any } | undefined {
    return this.requestLog[this.requestLog.length - 1]
  }

  /**
   * Clear request log
   */
  clearLog(): void {
    this.requestLog = []
  }

  /**
   * Reset all handlers
   */
  reset(): void {
    this.handlers.clear()
    this.requestLog = []
  }
}

/**
 * Create a delay promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wait for condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options
  const startTime = Date.now()

  while (true) {
    if (await condition()) {
      return
    }

    if (Date.now() - startTime > timeout) {
      throw new Error('waitFor timeout')
    }

    await delay(interval)
  }
}
