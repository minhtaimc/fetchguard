/**
 * Worker postMessage helpers
 * Utilities to send messages from worker thread to main thread
 */

import type { WorkerToMainMessage } from './messages'
import type { Result } from 'ts-micro-result'
import type { AuthResult } from './types'
import { MSG } from './messages'

/**
 * Internal helper to post message to main thread
 */
function post(message: WorkerToMainMessage): void {
  ;(self as DedicatedWorkerGlobalScope).postMessage(message)
}

/**
 * Send generic Result for non-fetch operations (INIT, LOGIN, LOGOUT, etc.)
 */
export function sendResult(id: string, result: Result<any>): void {
  post({
    type: MSG.RESULT,
    id,
    payload: { result: result.toJSON() }
  } as any)
}

/**
 * Send successful fetch response
 */
export function sendFetchResult(id: string, status: number, body: string, headers?: Record<string, string>): void {
  post({
    type: MSG.FETCH_RESULT,
    id,
    payload: headers ? ({ status, body, headers }) : ({ status, body })
  } as any)
}

/**
 * Send fetch error response
 */
export function sendFetchError(id: string, error: string, status?: number): void {
  post({
    type: MSG.FETCH_ERROR,
    id,
    payload: { error, status }
  } as any)
}

/**
 * Send READY event (worker initialized)
 */
export function sendReady(): void {
  post({
    type: MSG.READY,
    id: `evt_${Date.now()}`
  } as any)
}

/**
 * Send PONG response to PING
 */
export function sendPong(id: string, timestamp: number): void {
  post({
    type: MSG.PONG,
    id,
    payload: { timestamp }
  } as any)
}

/**
 * Send AUTH_STATE_CHANGED event
 */
export function sendAuthStateChanged(authResult: AuthResult): void {
  post({
    type: MSG.AUTH_STATE_CHANGED,
    id: `evt_${Date.now()}`,
    payload: authResult
  } as any)
}

/**
 * Send AUTH_CALL_RESULT (auth method result)
 */
export function sendAuthCallResult(id: string, authResult: AuthResult): void {
  post({
    type: MSG.AUTH_CALL_RESULT,
    id,
    payload: authResult
  } as any)
}
