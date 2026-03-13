import { describe, expect, it } from 'vitest'

import { normalizeEntityBasePath } from './entity-helpers'

describe('normalizeEntityBasePath', () => {
  it('falls back to default runtime path when basePath targets another entity', () => {
    expect(normalizeEntityBasePath('Listino', '/s/c')).toBe('/s/Listino')
  })

  it('keeps valid runtime basePath aligned with entity id', () => {
    expect(normalizeEntityBasePath('Listino', '/s/Listino')).toBe('/s/Listino')
  })

  it('falls back to default runtime path when basePath is not a runtime route', () => {
    expect(normalizeEntityBasePath('Listino', '/custom')).toBe('/s/Listino')
  })
})
