import type { ErrorDetail, Result } from 'ts-micro-result'
import type { WorkerConfig, FetchGuardRequestInit, ProviderPresetConfig, AuthResult, ApiResponse } from './types'

/**
 * MESSAGE PAYLOADS - SINGLE SOURCE OF TRUTH
 *
 * Define all message payloads here. Type unions and MSG constants are auto-generated.
 *
 * USAGE:
 * - To add a new message: Just add one line to the appropriate interface
 * - Payload types are automatically inferred
 * - MSG constants are automatically generated
 *
 * EXAMPLE:
 * ```typescript
 * interface MainPayloads {
 *   NEW_MESSAGE: { foo: string }  // Add this line
 * }
 * // => Automatically get MainToWorkerMessage union with NEW_MESSAGE
 * // => Automatically get MSG.NEW_MESSAGE = 'NEW_MESSAGE'
 * ```
 */

/**
 * Payloads for messages sent from Main thread → Worker thread
 */
export interface MainPayloads {
  SETUP: { config: WorkerConfig; providerConfig: ProviderPresetConfig | string | null }
  FETCH: { url: string; options?: FetchGuardRequestInit }
  AUTH_CALL: { method: string; args: unknown[]; emitEvent?: boolean }  // Generic auth method call (login, logout, loginWithPhone, etc.)
  CANCEL: undefined
  PING: { timestamp: number }
}

/**
 * Payloads for messages sent from Worker thread → Main thread
 */
export interface WorkerPayloads {
  ERROR: Result<never>  // Pass complete Result object with errors, status, meta
  READY: undefined
  SETUP_ERROR: { error: string }
  PONG: { timestamp: number }
  LOG: { level: 'info' | 'warn' | 'error'; message: string }
  AUTH_STATE_CHANGED: AuthResult
  AUTH_CALL_RESULT: AuthResult
  FETCH_RESULT: ApiResponse
  FETCH_ERROR: { error: string; status?: number }
}

/**
 * Generate message type from payload definition
 * Handles optional payloads (undefined) gracefully
 */
type MessageFromPayloads<P> = {
  [K in keyof P]: { id: string; type: K } & (
    P[K] extends undefined ? {} : { payload: P[K] }
  )
}[keyof P]

/**
 * Message type unions - auto-generated from payload interfaces
 */
export type MainToWorkerMessage = MessageFromPayloads<MainPayloads>
export type WorkerToMainMessage = MessageFromPayloads<WorkerPayloads>

/**
 * Message type unions for compile-time type checking
 */
export type MainType = keyof MainPayloads
export type WorkerType = keyof WorkerPayloads
export type MessageType = MainType | WorkerType

/**
 * MSG constants object
 * Usage: MSG.SETUP, MSG.FETCH, etc.
 */
export const MSG = Object.freeze({
  // Main -> Worker messages
  SETUP: 'SETUP',
  FETCH: 'FETCH',
  AUTH_CALL: 'AUTH_CALL',
  CANCEL: 'CANCEL',
  PING: 'PING',

  // Worker -> Main messages
  ERROR: 'ERROR',
  READY: 'READY',
  SETUP_ERROR: 'SETUP_ERROR',
  PONG: 'PONG',
  LOG: 'LOG',
  AUTH_STATE_CHANGED: 'AUTH_STATE_CHANGED',
  AUTH_CALL_RESULT: 'AUTH_CALL_RESULT',
  FETCH_RESULT: 'FETCH_RESULT',
  FETCH_ERROR: 'FETCH_ERROR'
}) as { readonly [K in MessageType]: K }
