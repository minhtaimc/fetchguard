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
  ApiResponse,
  TokenInfo,
  WorkerConfig,
  AuthResponseMode
} from './types'

// Message protocol types (for advanced usage)
export { MSG } from './messages'
export type {
  MainToWorkerMessage,
  WorkerToMainMessage,
  MessageType
} from './messages'

// Organized error definitions (inspired by old-workers)
export {
  GeneralErrors,
  InitErrors,
  AuthErrors,
  DomainErrors,
  NetworkErrors,
  RequestErrors
} from './errors'

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

