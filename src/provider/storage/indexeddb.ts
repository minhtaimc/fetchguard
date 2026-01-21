import type { RefreshTokenStorage, StorageErrorCallback } from '../../types'

/**
 * IndexedDB storage options
 */
export interface IndexedDBStorageOptions {
  /** Database name (default: 'FetchGuardDB') */
  dbName?: string
  /** Key for refresh token (default: 'refreshToken') */
  refreshTokenKey?: string
  /**
   * Error callback for debugging storage failures
   * Called when IndexedDB operations fail (quota exceeded, permission denied, etc.)
   * Storage still fails closed (returns null), but this allows logging/debugging.
   */
  onError?: StorageErrorCallback
}

/**
 * IndexedDB storage - only stores refresh token in IndexedDB
 * Suitable for body-based refresh strategy
 * Persists refresh token for reuse after reload
 *
 * @param options - Storage options or legacy dbName string
 * @param legacyRefreshTokenKey - Legacy refreshTokenKey (for backward compatibility)
 */
export function createIndexedDBStorage(
  options: IndexedDBStorageOptions | string = 'FetchGuardDB',
  legacyRefreshTokenKey?: string
): RefreshTokenStorage {
  // Support both new options object and legacy string arguments
  const config: Required<Omit<IndexedDBStorageOptions, 'onError'>> & Pick<IndexedDBStorageOptions, 'onError'> =
    typeof options === 'string'
      ? { dbName: options, refreshTokenKey: legacyRefreshTokenKey ?? 'refreshToken', onError: undefined }
      : {
          dbName: options.dbName ?? 'FetchGuardDB',
          refreshTokenKey: options.refreshTokenKey ?? 'refreshToken',
          onError: options.onError
        }

  const { dbName, refreshTokenKey, onError } = config
  const storeName = 'tokens'

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'key' })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }
    })
  }

  const promisifyRequest = <T>(request: IDBRequest<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  return {
    async get() {
      try {
        const db = await openDB()
        const transaction = db.transaction([storeName], 'readonly')
        const store = transaction.objectStore(storeName)
        const result = await promisifyRequest(store.get(refreshTokenKey))
        return result?.value || null
      } catch (error) {
        onError?.(error as Error, 'get')
        return null
      }
    },
    async set(token) {
      try {
        const db = await openDB()
        const transaction = db.transaction([storeName], 'readwrite')
        const store = transaction.objectStore(storeName)

        if (token) {
          await promisifyRequest(store.put({ key: refreshTokenKey, value: token, timestamp: Date.now() }))
        } else {
          await promisifyRequest(store.delete(refreshTokenKey))
        }
      } catch (error) {
        onError?.(error as Error, token ? 'set' : 'delete')
      }
    }
  }
}
