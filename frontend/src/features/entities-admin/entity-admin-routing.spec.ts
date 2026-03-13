import { describe, expect, it } from 'vitest'

import {
  buildEntityEditPath,
  isEntityConfigEditSessionPath,
  parseEntityConfigEditPath,
} from './entity-admin-routing'

describe('entity-admin-routing', () => {
  it('builds default nested paths for detail and form editors', () => {
    expect(buildEntityEditPath('account', 'object')).toBe(
      '/admin/entity-config/account/object',
    )
    expect(buildEntityEditPath('account', 'layouts')).toBe(
      '/admin/entity-config/account/layouts',
    )
    expect(buildEntityEditPath('account', 'detail', 'sections', 'sales')).toBe(
      '/admin/entity-config/account/layouts/sales/detail/sections',
    )
    expect(buildEntityEditPath('account', 'assignments', undefined, 'sales')).toBe(
      '/admin/entity-config/account/layouts/sales/assignments',
    )
  })

  it('parses nested detail and form editor paths', () => {
    expect(parseEntityConfigEditPath('/admin/entity-config/account/object')).toEqual({
      entityId: 'account',
      section: 'object',
      layoutId: null,
      detailArea: null,
      formArea: null,
    })

    expect(
      parseEntityConfigEditPath('/admin/entity-config/account/layouts/sales/detail/sections'),
    ).toEqual({
      entityId: 'account',
      section: 'detail',
      layoutId: 'sales',
      detailArea: 'sections',
      formArea: null,
    })
  })

  it('treats nested editor areas as part of the same edit session', () => {
    expect(isEntityConfigEditSessionPath('/admin/entity-config/account/object', 'account')).toBe(true)
    expect(isEntityConfigEditSessionPath('/admin/entity-config/account/layouts/sales/form/sections', 'account')).toBe(true)
    expect(
      isEntityConfigEditSessionPath(
        '/admin/entity-config/account/layouts/sales/assignments',
        'account',
      ),
    ).toBe(true)
    expect(isEntityConfigEditSessionPath('/admin/entity-config/contact/layouts/sales/form/sections', 'account')).toBe(false)
  })
})
