import { describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'

import { fetchEntityList, fetchEntityRelatedList, searchEntityFormLookup } from './entity-api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}))

describe('entity-api', () => {
  it('builds list requests with cursor instead of page', async () => {
    vi.mocked(apiFetch).mockResolvedValue({} as never)

    await fetchEntityList('account', {
      viewId: 'pipeline',
      cursor: 'cursor-2',
      pageSize: 25,
      search: 'Acme',
    })

    expect(apiFetch).toHaveBeenCalledWith(
      '/entities/account/list?viewId=pipeline&cursor=cursor-2&pageSize=25&search=Acme',
    )
  })

  it('builds related-list requests with cursor instead of page', async () => {
    vi.mocked(apiFetch).mockResolvedValue({} as never)

    await fetchEntityRelatedList('account', '001000000000001', 'contacts', {
      cursor: 'cursor-3',
      pageSize: 10,
    })

    expect(apiFetch).toHaveBeenCalledWith(
      '/entities/account/related/contacts?cursor=cursor-3&pageSize=10&recordId=001000000000001',
    )
  })

  it('posts lookup search requests for form reference fields', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ items: [] } as never)

    await searchEntityFormLookup('account', 'ParentId', {
      q: 'acme',
      limit: 5,
      context: {
        parentId: '001000000000001',
      },
    })

    expect(apiFetch).toHaveBeenCalledWith('/entities/account/form/lookups/ParentId/search', {
      method: 'POST',
      body: {
        q: 'acme',
        limit: 5,
        context: {
          parentId: '001000000000001',
        },
      },
    })
  })
})
