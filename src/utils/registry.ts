import type { TokenProvider } from '../types'

/**
 * Registry để quản lý các token provider
 */
const registry = new Map<string, TokenProvider>()

/**
 * Đăng ký một token provider với tên
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
 * Lấy provider theo tên
 */
export function getProvider(name: string): TokenProvider {
  const provider = registry.get(name)
  if (!provider) {
    throw new Error(`Provider '${name}' not found. Available providers: ${Array.from(registry.keys()).join(', ')}`)
  }
  return provider
}

/**
 * Kiểm tra provider có tồn tại không
 */
export function hasProvider(name: string): boolean {
  return registry.has(name)
}

/**
 * Lấy danh sách tất cả provider names
 */
export function listProviders(): string[] {
  return Array.from(registry.keys())
}

/**
 * Xóa provider
 */
export function unregisterProvider(name: string): boolean {
  return registry.delete(name)
}

/**
 * Xóa tất cả providers
 */
export function clearProviders(): void {
  registry.clear()
}
