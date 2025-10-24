import type { TokenProvider } from '../types'

/**
 * Registry to manage token providers
 */
const registry = new Map<string, TokenProvider>()

/**
 * Register a token provider with name
 */
export function registerProvider(name: string, provider: TokenProvider): void {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Provider name must be a non-empty string')
  }
  
  if (!provider || typeof provider.refreshToken !== 'function') {
    throw new Error('Provider must implement TokenProvider interface')
  }
  
  registry.set(name, provider)
}

/**
 * Get provider by name
 */
export function getProvider(name: string): TokenProvider {
  const provider = registry.get(name)
  if (!provider) {
    throw new Error(`Provider '${name}' not found. Available providers: ${Array.from(registry.keys()).join(', ')}`)
  }
  return provider
}

/**
 * Check if provider exists
 */
export function hasProvider(name: string): boolean {
  return registry.has(name)
}

/**
 * Get list of all provider names
 */
export function listProviders(): string[] {
  return Array.from(registry.keys())
}

/**
 * Remove provider
 */
export function unregisterProvider(name: string): boolean {
  return registry.delete(name)
}

/**
 * Remove all providers
 */
export function clearProviders(): void {
  registry.clear()
}
