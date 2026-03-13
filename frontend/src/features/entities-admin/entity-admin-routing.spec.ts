import { describe, expect, it } from 'vitest'

import {
  buildEntityEditPath,
  isEntityConfigEditSessionPath,
  parseEntityConfigEditPath,
} from './entity-admin-routing'

describe('entity-admin-routing', () => {
  it('builds default nested paths for detail and form editors', () => {
    expect(buildEntityEditPath('account', 'detail')).toBe(
      '/admin/entity-config/account/edit/detail/header-query',
    )
    expect(buildEntityEditPath('account', 'form')).toBe(
      '/admin/entity-config/account/edit/form/header-query',
    )
    expect(buildEntityEditPath('account', 'detail', 'sections', 'sales')).toBe(
      '/admin/entity-config/account/edit/layouts/sales/detail/sections',
    )
    expect(buildEntityEditPath('account', 'assignments', undefined, 'sales')).toBe(
      '/admin/entity-config/account/edit/layouts/sales/assignments',
    )
  })

  it('parses nested detail and form editor paths', () => {
    expect(parseEntityConfigEditPath('/admin/entity-config/account/edit/detail/sections')).toEqual({
      entityId: 'account',
      section: 'detail',
      layoutId: null,
      detailArea: 'sections',
      formArea: null,
    })

    expect(parseEntityConfigEditPath('/admin/entity-config/account/edit/form/sections')).toEqual({
      entityId: 'account',
      section: 'form',
      layoutId: null,
      detailArea: null,
      formArea: 'sections',
    })

    expect(
      parseEntityConfigEditPath('/admin/entity-config/account/edit/layouts/sales/detail/sections'),
    ).toEqual({
      entityId: 'account',
      section: 'detail',
      layoutId: 'sales',
      detailArea: 'sections',
      formArea: null,
    })
  })

  it('treats nested editor areas as part of the same edit session', () => {
    expect(isEntityConfigEditSessionPath('/admin/entity-config/account/edit/detail/sections', 'account')).toBe(true)
    expect(isEntityConfigEditSessionPath('/admin/entity-config/account/edit/form/sections', 'account')).toBe(true)
    expect(
      isEntityConfigEditSessionPath(
        '/admin/entity-config/account/edit/layouts/sales/assignments',
        'account',
      ),
    ).toBe(true)
    expect(isEntityConfigEditSessionPath('/admin/entity-config/contact/edit/form/sections', 'account')).toBe(false)
  })
})
