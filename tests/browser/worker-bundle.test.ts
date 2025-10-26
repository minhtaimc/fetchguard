import { describe, it, expect } from 'vitest'
import { MSG } from '../../dist/index.js'

const workerUrl = new URL('../../dist/worker.js', import.meta.url)

describe('FetchGuard worker bundle', () => {
  it('initializes and emits READY inside a real browser worker', async () => {
    const worker = new Worker(workerUrl, { type: 'module' })

    const readyPayload = await new Promise<{ type: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.terminate()
        reject(new Error('Worker did not send READY within the expected time'))
      }, 4000)

      worker.onmessage = (event) => {
        if (event.data?.type === MSG.READY) {
          clearTimeout(timeout)
          resolve(event.data)
        }
      }

      worker.onerror = (event) => {
        console.error('Worker error event', event)
        clearTimeout(timeout)
        worker.terminate()
        reject(event instanceof ErrorEvent ? event.error ?? event.message : event)
      }

      worker.postMessage({
        id: 'test_setup',
        type: MSG.SETUP,
        payload: {
          config: {
            allowedDomains: [],
            refreshEarlyMs: 60_000
          },
          providerConfig: {
            type: 'cookie-auth',
            refreshUrl: '/auth/refresh',
            loginUrl: '/auth/login',
            logoutUrl: '/auth/logout'
          }
        }
      })
    })

    expect(readyPayload.type).toBe(MSG.READY)

    worker.terminate()
  })
})

