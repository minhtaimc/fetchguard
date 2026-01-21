// Main exports
export { createClient, FetchGuardClient } from './client'
export type {
  FetchGuardOptions,
  FetchGuardRequestInit,
  TokenProvider,
  ProviderPresetConfig,
  RefreshTokenStorage,
  TokenParser,
  AuthStrategy,
  FetchEnvelope,
  TokenInfo,
  WorkerConfig,
  AuthResult,
  SerializedFormData,
  SerializedFile,
  SerializedFormDataEntry,
  NetworkErrorDetail,
  TransportResult,
  StorageErrorContext,
  StorageErrorCallback,
  DebugHooks,
  RefreshReason,
  RetryConfig,
  DedupeConfig,
  RequestMetrics
} from './types'

// Message protocol types (for advanced usage)
export { MSG } from './messages'
export type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  MessageType
} from './messages'

// Organized error definitions
export {
  GeneralErrors,
  InitErrors,
  AuthErrors,
  DomainErrors,
  RequestErrors
} from './errors'

// Error codes for type-safe error matching
export { ERROR_CODES } from './error-codes'
export type { ErrorCode, ErrorCodeKey } from './error-codes'

// Registry utilities
export { 
  registerProvider, 
  getProvider, 
  hasProvider, 
  listProviders, 
  unregisterProvider, 
  clearProviders 
} from './utils/registry'

// Provider factory
export { createProvider } from './provider/create-provider'
export type { ProviderConfig } from './provider/create-provider'

// Storage modules
export { createIndexedDBStorage } from './provider/storage/indexeddb'
export type { IndexedDBStorageOptions } from './provider/storage/indexeddb'

// Parser modules
export { bodyParser } from './provider/parser/body'
export { cookieParser } from './provider/parser/cookie'

// Strategy modules
export { cookieStrategy, createCookieStrategy } from './provider/strategy/cookie'
export { bodyStrategy, createBodyStrategy } from './provider/strategy/body'

// Preset providers (recommended)
export {
  createCookieProvider,
  createBodyProvider
} from './provider/presets'

// FormData utilities (for advanced usage)
export {
  serializeFormData,
  deserializeFormData,
  isFormData,
  isSerializedFormData
} from './utils/formdata'

// Binary utilities (for decoding binary responses)
export {
  base64ToArrayBuffer,
  isBinaryContentType
} from './utils/binary'

// Helper functions for common Result patterns
export {
  isNetworkError,
  isSuccess,
  isClientError,
  isServerError,
  parseJson,
  getErrorMessage,
  getErrorBody,
  getStatus,
  hasStatus,
  matchResult
} from './helpers'
