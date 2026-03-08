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
  })

  it('parses nested detail and form editor paths', () => {
    expect(parseEntityConfigEditPath('/admin/entity-config/account/edit/detail/sections')).toEqual({
      entityId: 'account',
      section: 'detail',
      detailArea: 'sections',
      formArea: null,
    })

    expect(parseEntityConfigEditPath('/admin/entity-config/account/edit/form/sections')).toEqual({
      entityId: 'account',
      section: 'form',
      detailArea: null,
      formArea: 'sections',
    })
  })

  it('treats nested editor areas as part of the same edit session', () => {
    expect(isEntityConfigEditSessionPath('/admin/entity-config/account/edit/detail/sections', 'account')).toBe(true)
    expect(isEntityConfigEditSessionPath('/admin/entity-config/account/edit/form/sections', 'account')).toBe(true)
    expect(isEntityConfigEditSessionPath('/admin/entity-config/contact/edit/form/sections', 'account')).toBe(false)
  })
})
