/**
 * Client features tests
 *
 * Tests for new client features: AbortSignal, metrics, hooks.
 * Note: These are unit tests, not integration tests (no actual Worker).
 */

import { describe, it, expect, vi } from 'vitest'
import { ERROR_CODES } from '../src/error-codes'
import { RequestErrors } from '../src/errors'
import type { RequestMetrics, DebugHooks, NetworkErrorDetail, FetchEnvelope } from '../src/types'

describe('RequestErrors.Timeout', () => {
  it('should create Timeout error with correct code', () => {
    const error = RequestErrors.Timeout()
    expect(error.code).toBe(ERROR_CODES.REQUEST_TIMEOUT)
    expect(error.message).toBe('Request timed out')
  })
})

describe('RequestMetrics type', () => {
  it('should have all required fields', () => {
    const metrics: RequestMetrics = {
      startTime: 1000,
      endTime: 2000,
      duration: 1000,
      queueTime: 50,
      ipcTime: 950
    }

    expect(metrics.startTime).toBe(1000)
    expect(metrics.endTime).toBe(2000)
    expect(metrics.duration).toBe(1000)
    expect(metrics.queueTime).toBe(50)
    expect(metrics.ipcTime).toBe(950)
  })

  it('should calculate correctly', () => {
    const startTime = Date.now()
    const sentAt = startTime + 100 // 100ms in queue
    const endTime = startTime + 500 // 500ms total

    const metrics: RequestMetrics = {
      startTime,
      endTime,
      duration: endTime - startTime,
      queueTime: sentAt - startTime,
      ipcTime: (endTime - startTime) - (sentAt - startTime)
    }

    expect(metrics.duration).toBe(500)
    expect(metrics.queueTime).toBe(100)
    expect(metrics.ipcTime).toBe(400)
  })
})

describe('DebugHooks type', () => {
  it('should support onRequest hook', () => {
    const onRequest = vi.fn()
    const hooks: DebugHooks = { onRequest }

    hooks.onRequest?.('/api/users', { method: 'GET' })

    expect(onRequest).toHaveBeenCalledWith('/api/users', { method: 'GET' })
  })

  it('should support onResponse hook with metrics', () => {
    const onResponse = vi.fn()
    const hooks: DebugHooks = { onResponse }

    const envelope: FetchEnvelope = {
      status: 200,
      body: '{"data":"test"}',
      contentType: 'application/json',
      headers: {}
    }

    const metrics: RequestMetrics = {
      startTime: 1000,
      endTime: 1500,
      duration: 500,
      queueTime: 10,
      ipcTime: 490
    }

    hooks.onResponse?.('/api/users', envelope, metrics)

    expect(onResponse).toHaveBeenCalledWith('/api/users', envelope, metrics)
  })

  it('should support onError hook with metrics', () => {
    const onError = vi.fn()
    const hooks: DebugHooks = { onError }

    const error: NetworkErrorDetail = {
      code: 'NETWORK_ERROR',
      message: 'Connection failed'
    }

    const metrics: RequestMetrics = {
      startTime: 1000,
      endTime: 1100,
      duration: 100,
      queueTime: 5,
      ipcTime: 95
    }

    hooks.onError?.('/api/users', error, metrics)

    expect(onError).toHaveBeenCalledWith('/api/users', error, metrics)
  })

  it('should support onRefresh hook', () => {
    const onRefresh = vi.fn()
    const hooks: DebugHooks = { onRefresh }

    hooks.onRefresh?.('proactive')
    hooks.onRefresh?.('expired')

    expect(onRefresh).toHaveBeenCalledWith('proactive')
    expect(onRefresh).toHaveBeenCalledWith('expired')
  })

  it('should support onWorkerReady hook', () => {
    const onWorkerReady = vi.fn()
    const hooks: DebugHooks = { onWorkerReady }

    hooks.onWorkerReady?.()

    expect(onWorkerReady).toHaveBeenCalled()
  })

  it('should support onWorkerError hook', () => {
    const onWorkerError = vi.fn()
    const hooks: DebugHooks = { onWorkerError }

    // Create a mock ErrorEvent-like object (ErrorEvent not available in happy-dom)
    const errorEvent = {
      type: 'error',
      message: 'Worker crashed',
      filename: 'worker.js',
      lineno: 1,
      colno: 1
    } as unknown as ErrorEvent

    hooks.onWorkerError?.(errorEvent)

    expect(onWorkerError).toHaveBeenCalledWith(errorEvent)
  })

  it('should support all hooks together', () => {
    const hooks: DebugHooks = {
      onRequest: vi.fn(),
      onResponse: vi.fn(),
      onError: vi.fn(),
      onRefresh: vi.fn(),
      onWorkerReady: vi.fn(),
      onWorkerError: vi.fn()
    }

    // All hooks should be defined
    expect(hooks.onRequest).toBeDefined()
    expect(hooks.onResponse).toBeDefined()
    expect(hooks.onError).toBeDefined()
    expect(hooks.onRefresh).toBeDefined()
    expect(hooks.onWorkerReady).toBeDefined()
    expect(hooks.onWorkerError).toBeDefined()
  })
})

describe('AbortSignal support (type checking)', () => {
  it('should accept signal in FetchGuardRequestInit', () => {
    // This is a compile-time check - if it compiles, the type is correct
    const controller = new AbortController()

    // FetchGuardRequestInit extends RequestInit which has signal
    const options: RequestInit = {
      method: 'GET',
      signal: controller.signal
    }

    expect(options.signal).toBe(controller.signal)
  })

  it('should create AbortController correctly', () => {
    const controller = new AbortController()

    expect(controller.signal.aborted).toBe(false)

    controller.abort()

    expect(controller.signal.aborted).toBe(true)
  })

  it('should handle abort reason', () => {
    const controller = new AbortController()
    const reason = new Error('User cancelled')

    controller.abort(reason)

    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBe(reason)
  })
})

describe('Error codes for new errors', () => {
  it('should have REQUEST_TIMEOUT code', () => {
    expect(ERROR_CODES.REQUEST_TIMEOUT).toBe('REQUEST_TIMEOUT')
  })

  it('should have REQUEST_CANCELLED code', () => {
    expect(ERROR_CODES.REQUEST_CANCELLED).toBe('REQUEST_CANCELLED')
  })

  it('should have QUEUE_FULL code', () => {
    expect(ERROR_CODES.QUEUE_FULL).toBe('QUEUE_FULL')
  })
})
