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

function readJsonBody(call: FetchCall): Record<string, unknown> {
  assert.equal(typeof call.init?.body, 'string')
  return JSON.parse(call.init?.body as string) as Record<string, unknown>
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

test('findContactByEmail uses source scoped raw query and normalizes one contact', async () => {
  const restoreEnv = withConnectorEnv()
  const capturedCalls: FetchCall[] = []
  const restoreFetch = withFetchMock((call) => {
    capturedCalls.push(call)
    return jsonResponse(200, {
      records: [
        {
          Id: '003xx000004TmiQAAS',
          Name: 'Ada Lovelace',
          Email: 'ada@example.com',
          RecordType: { DeveloperName: 'Customer' }
        }
      ]
    })
  })

  try {
    const service = createSalesforceService()

    const contact = await service.findContactByEmail(' Ada@Example.COM ')

    assert.deepEqual(contact, {
      id: '003xx000004TmiQAAS',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      recordTypeDeveloperName: 'Customer'
    })
    assert.equal(capturedCalls.length, 1)
    assert.equal(
      capturedCalls[0].url,
      'http://connectors.internal/internal/connectors/sources/salesforce-default/query/raw'
    )
    assert.equal(capturedCalls[0].init?.method, 'POST')
    assert.deepEqual(readJsonBody(capturedCalls[0]), {
      soql: "SELECT Id, Name, Email, RecordType.DeveloperName FROM Contact WHERE Email = 'ada@example.com' LIMIT 2"
    })
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('findContactByEmail returns null when no contact is found', async () => {
  const restoreEnv = withConnectorEnv()
  const restoreFetch = withFetchMock(() => jsonResponse(200, { records: [] }))

  try {
    const service = createSalesforceService()

    assert.equal(await service.findContactByEmail('missing@example.com'), null)
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('findContactByEmail rejects ambiguous contacts', async () => {
  const restoreEnv = withConnectorEnv()
  const restoreFetch = withFetchMock(() =>
    jsonResponse(200, {
      records: [{ Id: '0031' }, { Id: '0032' }]
    })
  )

  try {
    const service = createSalesforceService()

    await assert.rejects(
      () => service.findContactByEmail('duplicate@example.com'),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        error.message === 'Multiple Contacts found for duplicate@example.com'
    )
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('findContactById uses source scoped raw query and normalizes one contact', async () => {
  const restoreEnv = withConnectorEnv()
  const capturedCalls: FetchCall[] = []
  const restoreFetch = withFetchMock((call) => {
    capturedCalls.push(call)
    return jsonResponse(200, {
      records: [
        {
          Id: '003xx000004TmiQAAS',
          Name: 'Ada Lovelace',
          Email: 'ada@example.com',
          RecordType: { DeveloperName: 'Customer' }
        }
      ]
    })
  })

  try {
    const service = createSalesforceService()

    const contact = await service.findContactById(' 003xx000004TmiQAAS ')

    assert.deepEqual(contact, {
      id: '003xx000004TmiQAAS',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      recordTypeDeveloperName: 'Customer'
    })
    assert.equal(capturedCalls.length, 1)
    assert.equal(
      capturedCalls[0].url,
      'http://connectors.internal/internal/connectors/sources/salesforce-default/query/raw'
    )
    assert.deepEqual(readJsonBody(capturedCalls[0]), {
      soql: "SELECT Id, Name, Email, RecordType.DeveloperName FROM Contact WHERE Id = '003xx000004TmiQAAS' LIMIT 1"
    })
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('searchContactsByIdOrName uses source scoped raw query and validates limit', async () => {
  const restoreEnv = withConnectorEnv()
  const capturedCalls: FetchCall[] = []
  const restoreFetch = withFetchMock((call) => {
    capturedCalls.push(call)
    return jsonResponse(200, {
      records: [
        {
          Id: '003xx000004TmiQAAS',
          Name: 'Ada Lovelace',
          RecordType: { DeveloperName: 'Customer' }
        }
      ]
    })
  })

  try {
    const service = createSalesforceService()

    const contacts = await service.searchContactsByIdOrName("Ada'", 8)

    assert.deepEqual(contacts, [
      {
        id: '003xx000004TmiQAAS',
        name: 'Ada Lovelace',
        recordTypeDeveloperName: 'Customer'
      }
    ])
    assert.equal(capturedCalls.length, 1)
    assert.equal(
      capturedCalls[0].url,
      'http://connectors.internal/internal/connectors/sources/salesforce-default/query/raw'
    )
    assert.deepEqual(readJsonBody(capturedCalls[0]), {
      soql: "SELECT Id, Name, RecordType.DeveloperName FROM Contact WHERE Name LIKE 'Ada\\'%' OR Id = 'Ada\\'' ORDER BY Name ASC, Id ASC LIMIT 8"
    })

    await assert.rejects(
      () => service.searchContactsByIdOrName('Ada', 9),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === 'limit must be between 1 and 8'
    )
  } finally {
    restoreFetch()
    restoreEnv()
  }
})

test('read only query helpers use source scoped raw query endpoints', async () => {
  const restoreEnv = withConnectorEnv()
  const capturedCalls: FetchCall[] = []
  const restoreFetch = withFetchMock((call) => {
    capturedCalls.push(call)
    return jsonResponse(200, {
      done: true,
      totalSize: 0,
      records: []
    })
  })

  try {
    const service = createSalesforceService({ rawQueryEnabled: true })

    await service.executeReadOnlyQuery('SELECT Id FROM Account')
    await service.executeReadOnlyQueryPage('SELECT Id FROM Account', 200)
    await service.executeReadOnlyQueryMore('/services/data/v1/query/next', 200)
    await service.executeRawQuery('SELECT Id FROM Account')

    assert.deepEqual(
      capturedCalls.map((call) => call.url),
      [
        'http://connectors.internal/internal/connectors/sources/salesforce-default/query/raw',
        'http://connectors.internal/internal/connectors/sources/salesforce-default/query/raw/page',
        'http://connectors.internal/internal/connectors/sources/salesforce-default/query/raw/more',
        'http://connectors.internal/internal/connectors/sources/salesforce-default/query/raw'
      ]
    )
    assert.deepEqual(readJsonBody(capturedCalls[2]), {
      cursor: '/services/data/v1/query/next',
      pageSize: 200
    })
  } finally {
    restoreFetch()
    restoreEnv()
  }
})
