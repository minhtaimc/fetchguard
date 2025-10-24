import type { RefreshTokenStorage } from '../../types'

/**
 * IndexedDB storage - chỉ lưu refresh token trong IndexedDB
 * Phù hợp cho body-based refresh strategy
 * Persist refresh token để dùng lại sau khi reload
 */
export function createIndexedDBStorage(dbName = 'FetchGuardDB', refreshTokenKey = 'refreshToken'): RefreshTokenStorage {
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
        console.warn('Failed to get refresh token from IndexedDB:', error)
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
        console.warn('Failed to save refresh token to IndexedDB:', error)
      }
    }
  }
}
