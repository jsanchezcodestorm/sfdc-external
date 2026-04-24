import assert from 'node:assert/strict'
import test from 'node:test'

import { BadRequestException, ForbiddenException } from '@nestjs/common'

import { SalesforceNotConfiguredException } from './salesforce-not-configured.exception'
import { SalesforceService } from './salesforce.service'

type FetchCall = {
  url: string
  init?: RequestInit
}

function createSalesforceService(options?: { rawQueryEnabled?: boolean }) {
  const configService = {
    get(key: string, defaultValue?: string) {
      if (key === 'ENABLE_RAW_SALESFORCE_QUERY') {
        return options?.rawQueryEnabled ? 'true' : 'false'
      }

      return defaultValue
    }
  }

  return new SalesforceService(configService as never)
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

function withFetchMock(handler: (call: FetchCall) => Promise<Response> | Response) {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    handler({ url: String(input), init })) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
  }
}

test('describeGlobalObjects forwards requests to platform connectors service', async () => {
  const restoreEnv = withConnectorEnv()
  const capturedCalls: FetchCall[] = []
  const restoreFetch = withFetchMock((call) => {
    capturedCalls.push(call)
    return jsonResponse(200, {
      items: [{ name: 'Account', label: 'Account', custom: false }]
    })
  })

  try {
    const service = createSalesforceService()

    const objects = await service.describeGlobalObjects()

    assert.deepEqual(objects, [{ name: 'Account', label: 'Account', custom: false }])
    assert.equal(capturedCalls.length, 1)

    const call = capturedCalls[0] as FetchCall

    assert.equal(
      call.url,
      'http://connectors.internal/internal/connectors/sources/salesforce-default/describe/objects'
    )
    assert.equal(call.init?.method, 'GET')

    const headers = new Headers(call.init?.headers)
    assert.equal(headers.get('x-platform-internal-token'), 'test-internal-token')
    assert.equal(headers.get('content-type'), null)
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('describeObject maps connector 400 responses to BadRequestException', async () => {
  const restoreEnv = withConnectorEnv()
  const restoreFetch = withFetchMock(() =>
    jsonResponse(400, { message: 'Unsupported Salesforce object' })
  )

  try {
    const service = createSalesforceService()

    await assert.rejects(
      () => service.describeObject('Nope__c'),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'Unsupported Salesforce object'
    )
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('ping maps connector 503 responses to SalesforceNotConfiguredException', async () => {
  const restoreEnv = withConnectorEnv()
  const restoreFetch = withFetchMock(() =>
    jsonResponse(503, { message: 'Salesforce connector is not configured' })
  )

  try {
    const service = createSalesforceService()

    await assert.rejects(
      () => service.ping(),
      (error: unknown) => error instanceof SalesforceNotConfiguredException
    )
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('executeRawQuery fails closed when the feature flag is disabled', async () => {
  let fetchWasCalled = false
  const restoreFetch = withFetchMock(() => {
    fetchWasCalled = true
    return jsonResponse(200, { ok: true })
  })

  try {
    const service = createSalesforceService()

    await assert.rejects(
      () => service.executeRawQuery('SELECT Id FROM Account'),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        error.message === 'Raw Salesforce query endpoint is disabled'
    )
    assert.equal(fetchWasCalled, false)
  } finally {
    restoreFetch()
  }
})
