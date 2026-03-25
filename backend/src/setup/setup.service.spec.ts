import assert from 'node:assert/strict'
import test from 'node:test'

import { BadRequestException, ConflictException } from '@nestjs/common'

import { SetupService } from './setup.service'

type PersistedSetupRecord = {
  siteName: string
  adminEmail: string
  salesforceMode: 'USERNAME_PASSWORD' | 'ACCESS_TOKEN'
  salesforceConfigEncrypted: string
  completedAt: Date
}

type SavedCredential = {
  contactId: string
  username: string
  password: string
  enabled: boolean
}

type TransactionState = {
  savedSetup: PersistedSetupRecord | null
  savedCredential: SavedCredential | null
}

type FetchCall = {
  url: string
  init?: RequestInit
}

function createSetupService(options?: {
  record?: PersistedSetupRecord | null
  credentialError?: Error
}) {
  const state: TransactionState = {
    savedSetup: null,
    savedCredential: null
  }
  let activeTransaction: TransactionState | null = null

  const setupRepository = {
    async getRecord() {
      return options?.record ?? null
    },
    async saveCompletedSetup(input: PersistedSetupRecord, tx?: TransactionState) {
      ;(tx ?? activeTransaction ?? state).savedSetup = input
    }
  }

  const localCredentialProvisioningService = {
    async upsertResolvedCredential(input: SavedCredential) {
      if (options?.credentialError) {
        throw options.credentialError
      }

      ;(activeTransaction ?? state).savedCredential = input
    }
  }

  const prismaService = {
    async $transaction<T>(callback: (tx: TransactionState) => Promise<T>) {
      const transactionState: TransactionState = {
        savedSetup: null,
        savedCredential: null
      }
      activeTransaction = transactionState

      try {
        const result = await callback(transactionState)
        state.savedSetup = transactionState.savedSetup
        state.savedCredential = transactionState.savedCredential
        return result
      } finally {
        activeTransaction = null
      }
    }
  }

  return {
    service: new SetupService(
      setupRepository as never,
      localCredentialProvisioningService as never,
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
  const previousToken = process.env.PLATFORM_INTERNAL_TOKEN

  process.env.PLATFORM_CONNECTORS_SERVICE_URL = 'http://connectors.internal'
  process.env.PLATFORM_INTERNAL_TOKEN = 'test-internal-token'

  return () => {
    if (previousUrl === undefined) {
      delete process.env.PLATFORM_CONNECTORS_SERVICE_URL
    } else {
      process.env.PLATFORM_CONNECTORS_SERVICE_URL = previousUrl
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
      'http://connectors.internal/internal/connectors/salesforce/test'
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
      id: '003000000000001AAA',
      email: 'admin@example.com'
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
      'http://connectors.internal/internal/connectors/salesforce/configure'
    )
    assert.equal(
      fetchMock.calls[1]?.url,
      'http://connectors.internal/internal/connectors/salesforce/contacts/by-email?email=admin%40example.com'
    )
    assert.deepEqual(JSON.parse(String(fetchMock.calls[0]?.init?.body)), {
      salesforce: {
        mode: 'access-token',
        instanceUrl: 'https://example.my.salesforce.com',
        accessToken: 'token-123'
      }
    })

    assert.equal(state.savedSetup?.siteName, 'Acme Portal')
    assert.equal(state.savedSetup?.adminEmail, 'admin@example.com')
    assert.equal(state.savedSetup?.salesforceMode, 'ACCESS_TOKEN')
    assert.equal(state.savedSetup?.salesforceConfigEncrypted, 'platform-managed')
    assert.equal(state.savedSetup?.completedAt instanceof Date, true)
    assert.deepEqual(state.savedCredential, {
      contactId: '003000000000001AAA',
      username: 'admin@example.com',
      password: 'Password!123',
      enabled: true
    })
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

test('completeSetup fails when adminEmail does not map to a Salesforce Contact', async () => {
  const restoreEnv = withConnectorEnv()
  const fetchMock = withFetchSequence([
    jsonResponse(200, {
      success: true,
      organizationId: '00D000000000001',
      instanceUrl: 'https://example.my.salesforce.com'
    }),
    jsonResponse(200, null)
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
        error instanceof BadRequestException &&
        error.message ===
          'adminEmail must match an existing Salesforce Contact before completing setup'
    )

    assert.equal(state.savedSetup, null)
    assert.equal(state.savedCredential, null)
  } finally {
    fetchMock.restore()
    restoreEnv()
  }
})

test('completeSetup rolls back setup persistence when credential provisioning fails', async () => {
  const restoreEnv = withConnectorEnv()
  const fetchMock = withFetchSequence([
    jsonResponse(200, {
      success: true,
      organizationId: '00D000000000001',
      instanceUrl: 'https://example.my.salesforce.com'
    }),
    jsonResponse(200, {
      id: '003000000000001AAA',
      email: 'admin@example.com'
    })
  ])

  try {
    const { service, state } = createSetupService({
      credentialError: new BadRequestException(
        'credential.password is required when creating a local credential'
      )
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
        error instanceof BadRequestException &&
        error.message === 'credential.password is required when creating a local credential'
    )

    assert.equal(state.savedSetup, null)
    assert.equal(state.savedCredential, null)
  } finally {
    fetchMock.restore()
    restoreEnv()
  }
})
