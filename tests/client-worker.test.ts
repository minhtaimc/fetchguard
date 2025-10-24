import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ok as resultOk } from 'ts-micro-result'
import { FetchGuardClient } from '../src/client'
import { MSG } from '../src/messages'
import { waitFor } from './test-utils'

type WorkerMessageHandler = ((event: { data: any }) => void) | null

class MockWorker {
  static instances: MockWorker[] = []

  public messages: any[] = []
  public onmessage: WorkerMessageHandler = null
  public onerror: WorkerMessageHandler = null
  public readyEvents = 0

  constructor(public url: string | URL, public options?: WorkerOptions) {
    MockWorker.instances.push(this)
  }

  postMessage(message: any): void {
    this.messages.push(message)

    if (message.type === MSG.SETUP) {
      setTimeout(() => {
        this.readyEvents += 1
        this.onmessage?.({
          data: { type: MSG.READY, id: `evt_${Date.now()}` }
        })
      }, 0)
    }

    if (message.type === MSG.PING) {
      setTimeout(() => {
        this.onmessage?.({
          data: {
            type: MSG.PONG,
            id: message.id,
            payload: { timestamp: message.payload?.timestamp }
          }
        })
      }, 0)
    }

    if (message.type === MSG.AUTH_CALL) {
      setTimeout(() => {
        const mode = message.payload?.responseMode ?? 'result-only'
        const state = { authenticated: true, expiresAt: Date.now() + 10_000, user: { id: 'mock-user' } }

        if (mode !== 'event-only') {
          this.onmessage?.({
            data: {
              type: MSG.RESULT,
              id: message.id,
              payload: { result: resultOk(state).toJSON() }
            }
          })
        }

        if (mode !== 'result-only') {
          this.onmessage?.({
            data: {
              type: MSG.AUTH_STATE_CHANGED,
              id: `evt_${Date.now()}`,
              payload: state
            }
          })
        }
      }, 0)
    }
  }

  terminate(): void {
    // no-op for tests
  }

  static reset(): void {
    MockWorker.instances = []
  }
}

const originalWorker = globalThis.Worker

beforeAll(() => {
  ;(globalThis as any).Worker = MockWorker as any
})

afterAll(() => {
  ;(globalThis as any).Worker = originalWorker
})

beforeEach(() => {
  MockWorker.reset()
})

describe('FetchGuardClient worker integration', () => {
  it('creates worker and completes READY handshake', async () => {
    const client = new FetchGuardClient({
      provider: {
        type: 'body-auth',
        refreshUrl: '/auth/refresh',
        loginUrl: '/auth/login',
        logoutUrl: '/auth/logout',
        refreshTokenKey: 'refresh-token'
      },
      allowedDomains: ['api.example.com']
    })

    const instance = MockWorker.instances[0]
    expect(instance).toBeDefined()
    expect(instance?.options?.type).toBe('module')

    await waitFor(() => instance?.readyEvents === 1)

    const setupMessage = instance?.messages.find((msg) => msg.type === MSG.SETUP)
    expect(setupMessage).toBeDefined()
    expect(setupMessage?.payload?.config?.allowedDomains).toEqual(['api.example.com'])
    expect(setupMessage?.payload?.providerConfig).toEqual({
      type: 'body-auth',
      refreshUrl: '/auth/refresh',
      loginUrl: '/auth/login',
      logoutUrl: '/auth/logout',
      refreshTokenKey: 'refresh-token'
    })

    const pingResult = await client.ping()
    expect(pingResult.isOk()).toBe(true)

    client.destroy()
  })

  it('defaults auth call response mode to result-only', async () => {
    const client = new FetchGuardClient({
      provider: {
        type: 'body-auth',
        refreshUrl: '/auth/refresh',
        loginUrl: '/auth/login',
        logoutUrl: '/auth/logout',
        refreshTokenKey: 'refresh-token'
      }
    })

    const instance = MockWorker.instances[0]
    await waitFor(() => instance?.readyEvents === 1)

    await client.call('customMethod')

    const authMessage = instance?.messages.find(
      (msg) => msg.type === MSG.AUTH_CALL && msg.payload?.method === 'customMethod'
    )
    expect(authMessage?.payload?.responseMode).toBe('result-only')

    client.destroy()
  })

})
