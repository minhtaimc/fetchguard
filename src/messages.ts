import type { SerializedResult } from 'ts-micro-result'
import type { WorkerConfig, FetchGuardRequestInit, ProviderPresetConfig } from './types'

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
  AUTH_CALL: { method: string; args: unknown[] }  // Generic auth method call (login, logout, loginWithPhone, etc.)
  CANCEL: undefined
  PING: { timestamp: number }
}

/**
 * Payloads for messages sent from Worker thread → Main thread
 */
export interface WorkerPayloads {
  RESULT: { result: SerializedResult | object }
  READY: undefined
  PONG: { timestamp: number }
  LOG: { level: 'info' | 'warn' | 'error'; message: string }
  AUTH_STATE_CHANGED: { authenticated: boolean; expiresAt?: number | null; user?: unknown }
  FETCH_RESULT: { status: number; headers?: Record<string, string>; body: string }
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
 * MSG constants object - auto-generated from payload keys
 * Usage: MSG.SETUP, MSG.FETCH, etc.
 */
export const MSG = Object.freeze({
  ...Object.fromEntries(
    (Object.keys({} as MainPayloads) as (keyof MainPayloads)[]).map(k => [k, k])
  ),
  ...Object.fromEntries(
    (Object.keys({} as WorkerPayloads) as (keyof WorkerPayloads)[]).map(k => [k, k])
  ),
}) as { readonly [K in MessageType]: K }
