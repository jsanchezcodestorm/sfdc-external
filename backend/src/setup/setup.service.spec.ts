import assert from 'node:assert/strict'
import test from 'node:test'

import { ConflictException } from '@nestjs/common'

import { PlatformHttpError } from '../platform/platform-clients'
import { SetupService } from './setup.service'

type PersistedSetupRecord = {
  siteName: string
  adminEmail: string
  salesforceMode: 'USERNAME_PASSWORD' | 'ACCESS_TOKEN'
  salesforceConfigEncrypted: string
  completedAt: Date
}

type TransactionState = {
  savedSetup: PersistedSetupRecord | null
}

type FetchCall = {
  url: string
  init?: RequestInit
}

function createSetupService(options?: {
  record?: PersistedSetupRecord | null
  saveError?: Error
}) {
  const state: TransactionState = {
    savedSetup: null
  }
  let activeTransaction: TransactionState | null = null

  const setupRepository = {
    async getRecord() {
      return options?.record ?? null
    },
    async saveCompletedSetup(input: PersistedSetupRecord, tx?: TransactionState) {
      if (options?.saveError) {
        throw options.saveError
      }

      ;(tx ?? activeTransaction ?? state).savedSetup = input
    }
  }

  const prismaService = {
    async $transaction<T>(callback: (tx: TransactionState) => Promise<T>) {
      const transactionState: TransactionState = {
        savedSetup: null
      }
      activeTransaction = transactionState

      try {
        const result = await callback(transactionState)
        state.savedSetup = transactionState.savedSetup
        return result
      } finally {
        activeTransaction = null
      }
    }
  }

  return {
    service: new SetupService(
      setupRepository as never,
      prismaService as never
    ),
    state
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function withConnectorEnv() {
  const previousUrl = process.env.PLATFORM_CONNECTORS_SERVICE_URL
  const previousAuthUrl = process.env.PLATFORM_AUTH_SERVICE_URL
  const previousToken = process.env.PLATFORM_INTERNAL_TOKEN

  process.env.PLATFORM_CONNECTORS_SERVICE_URL = 'http://connectors.internal'
  process.env.PLATFORM_AUTH_SERVICE_URL = 'http://auth.internal'
  process.env.PLATFORM_INTERNAL_TOKEN = 'test-internal-token'

  return () => {
    if (previousUrl === undefined) {
      delete process.env.PLATFORM_CONNECTORS_SERVICE_URL
    } else {
      process.env.PLATFORM_CONNECTORS_SERVICE_URL = previousUrl
    }

    if (previousAuthUrl === undefined) {
      delete process.env.PLATFORM_AUTH_SERVICE_URL
    } else {
      process.env.PLATFORM_AUTH_SERVICE_URL = previousAuthUrl
    }

    if (previousToken === undefined) {
      delete process.env.PLATFORM_INTERNAL_TOKEN
    } else {
      process.env.PLATFORM_INTERNAL_TOKEN = previousToken
    }
  }
}

function withFetchSequence(responses: Response[]) {
  const calls: FetchCall[] = []
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: String(input), init })
    const nextResponse = responses.shift()
    assert.ok(nextResponse, 'Unexpected fetch call')
    return nextResponse
  }) as typeof fetch

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch
    }
  }
}

test('getStatus reports pending when setup is missing', async () => {
  const { service } = createSetupService()

  const status = await service.getStatus()

  assert.deepEqual(status, {
    state: 'pending',
    authConfigMode: 'database'
  })
})

test('getStatus reports completed with site name when setup exists', async () => {
  const { service } = createSetupService({
    record: {
      siteName: 'Acme Portal',
      adminEmail: 'admin@example.com',
      salesforceMode: 'USERNAME_PASSWORD',
      salesforceConfigEncrypted: 'platform-managed',
      completedAt: new Date('2026-03-10T10:00:00.000Z')
    }
  })

  const status = await service.getStatus()

  assert.deepEqual(status, {
    state: 'completed',
    siteName: 'Acme Portal',
    authConfigMode: 'database'
  })
})

test('getCompletedSetup returns platform-managed connector markers', async () => {
  const { service } = createSetupService({
    record: {
      siteName: 'Configured Portal',
      adminEmail: 'admin@example.com',
      salesforceMode: 'ACCESS_TOKEN',
      salesforceConfigEncrypted: 'platform-managed',
      completedAt: new Date('2026-03-10T10:00:00.000Z')
    }
  })

  const completedSetup = await service.getCompletedSetup()

  assert.deepEqual(completedSetup, {
    siteName: 'Configured Portal',
    adminEmail: 'admin@example.com',
    salesforce: {
      mode: 'access-token',
      instanceUrl: 'platform-managed',
      accessToken: 'platform-managed'
    },
    completedAt: '2026-03-10T10:00:00.000Z'
  })
})

test('testSalesforceConfig forwards connector test requests while setup is pending', async () => {
  const restoreEnv = withConnectorEnv()
  const fetchMock = withFetchSequence([
    jsonResponse(200, {
      success: true,
      organizationId: '00D000000000001',
      instanceUrl: 'https://example.my.salesforce.com',
      username: 'integration@example.com'
    })
  ])

  try {
    const { service } = createSetupService()

    const result = await service.testSalesforceConfig({
      mode: 'access-token',
      instanceUrl: 'https://example.my.salesforce.com',
      accessToken: 'token-123'
    })

    assert.deepEqual(result, {
      success: true,
      organizationId: '00D000000000001',
      instanceUrl: 'https://example.my.salesforce.com',
      username: 'integration@example.com'
    })
    assert.equal(fetchMock.calls.length, 1)
    assert.equal(
      fetchMock.calls[0]?.url,
      'http://connectors.internal/internal/connectors/sources/salesforce-default/test'
    )
    assert.deepEqual(JSON.parse(String(fetchMock.calls[0]?.init?.body)), {
      salesforce: {
        mode: 'access-token',
        instanceUrl: 'https://example.my.salesforce.com',
        accessToken: 'token-123'
      }
    })

    const headers = new Headers(fetchMock.calls[0]?.init?.headers)
    assert.equal(headers.get('x-platform-internal-token'), 'test-internal-token')
    assert.equal(headers.get('content-type'), 'application/json')
  } finally {
    fetchMock.restore()
    restoreEnv()
  }
})

test('completeSetup configures the connector and persists a platform-managed setup marker', async () => {
  const restoreEnv = withConnectorEnv()
  const fetchMock = withFetchSequence([
    jsonResponse(200, {
      success: true,
      organizationId: '00D000000000001',
      instanceUrl: 'https://example.my.salesforce.com',
      username: 'integration@example.com'
    }),
    jsonResponse(200, {
      id: 'admin@example.com'
    })
  ])

  try {
    const { service, state } = createSetupService()

    const status = await service.completeSetup({
      siteName: 'Acme Portal',
      adminEmail: 'admin@example.com',
      bootstrapPassword: 'Password!123',
      salesforce: {
        mode: 'access-token',
        instanceUrl: 'https://example.my.salesforce.com',
        accessToken: 'token-123'
      }
    })

    assert.deepEqual(status, {
      state: 'completed',
      siteName: 'Acme Portal',
      authConfigMode: 'database'
    })
    assert.equal(fetchMock.calls.length, 2)
    assert.equal(
      fetchMock.calls[0]?.url,
      'http://connectors.internal/internal/connectors/sources/salesforce-default/configure'
    )
    assert.equal(
      fetchMock.calls[1]?.url,
      'http://auth.internal/internal/identities/upsert'
    )
    assert.deepEqual(JSON.parse(String(fetchMock.calls[0]?.init?.body)), {
      salesforce: {
        mode: 'access-token',
        instanceUrl: 'https://example.my.salesforce.com',
        accessToken: 'token-123'
      }
    })
    assert.deepEqual(JSON.parse(String(fetchMock.calls[1]?.init?.body)), {
      email: 'admin@example.com',
      username: 'admin@example.com',
      password: 'Password!123',
      enabled: true,
      memberships: [
        {
          productCode: 'sfdc-external',
          subjectId: 'admin@example.com',
          attributes: {
            sessionClaims: {
              bootstrapAdmin: true
            }
          }
        }
      ]
    })

    assert.equal(state.savedSetup?.siteName, 'Acme Portal')
    assert.equal(state.savedSetup?.adminEmail, 'admin@example.com')
    assert.equal(state.savedSetup?.salesforceMode, 'ACCESS_TOKEN')
    assert.equal(state.savedSetup?.salesforceConfigEncrypted, 'platform-managed')
    assert.equal(state.savedSetup?.completedAt instanceof Date, true)
  } finally {
    fetchMock.restore()
    restoreEnv()
  }
})

test('completeSetup rejects repeated setup completion attempts', async () => {
  const { service } = createSetupService({
    record: {
      siteName: 'Configured Portal',
      adminEmail: 'admin@example.com',
      salesforceMode: 'ACCESS_TOKEN',
      salesforceConfigEncrypted: 'platform-managed',
      completedAt: new Date('2026-03-10T10:00:00.000Z')
    }
  })

  await assert.rejects(
    () =>
      service.completeSetup({
        siteName: 'Another Portal',
        adminEmail: 'other@example.com',
        bootstrapPassword: 'Password!123',
        salesforce: {
          mode: 'access-token',
          instanceUrl: 'https://example.my.salesforce.com',
          accessToken: 'token-123'
        }
      }),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === 'Initial setup has already been completed'
  )
})

test('completeSetup fails before persistence when identity upsert fails', async () => {
  const restoreEnv = withConnectorEnv()
  const fetchMock = withFetchSequence([
    jsonResponse(200, {
      success: true,
      organizationId: '00D000000000001',
      instanceUrl: 'https://example.my.salesforce.com'
    }),
    jsonResponse(400, { message: 'identity upsert failed' })
  ])

  try {
    const { service, state } = createSetupService()

    await assert.rejects(
      () =>
        service.completeSetup({
          siteName: 'Acme Portal',
          adminEmail: 'missing@example.com',
          bootstrapPassword: 'Password!123',
          salesforce: {
            mode: 'access-token',
            instanceUrl: 'https://example.my.salesforce.com',
            accessToken: 'token-123'
          }
        }),
      (error: unknown) =>
        error instanceof PlatformHttpError &&
        error.getStatus() === 400 &&
        error.message === 'identity upsert failed'
    )

    assert.equal(state.savedSetup, null)
  } finally {
    fetchMock.restore()
    restoreEnv()
  }
})

test('completeSetup rolls back setup persistence when saving setup fails', async () => {
  const restoreEnv = withConnectorEnv()
  const fetchMock = withFetchSequence([
    jsonResponse(200, {
      success: true,
      organizationId: '00D000000000001',
      instanceUrl: 'https://example.my.salesforce.com'
    }),
    jsonResponse(200, {
      id: 'admin@example.com'
    })
  ])

  try {
    const { service, state } = createSetupService({
      saveError: new Error('setup save failed')
    })

    await assert.rejects(
      () =>
        service.completeSetup({
          siteName: 'Acme Portal',
          adminEmail: 'admin@example.com',
          bootstrapPassword: 'Password!123',
          salesforce: {
            mode: 'access-token',
            instanceUrl: 'https://example.my.salesforce.com',
            accessToken: 'token-123'
          }
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === 'setup save failed'
    )

    assert.equal(state.savedSetup, null)
  } finally {
    fetchMock.restore()
    restoreEnv()
  }
})
