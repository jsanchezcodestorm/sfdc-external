export type NavigationRouteItem = {
  id: string
  target?: string
  description?: string
}

export type NavigationRoutesResponse = {
  items: NavigationRouteItem[]
}

export type KnownRouteId =
  | 'route:home'
  | 'route:admin-auth'
  | 'route:admin-entity-config'
  | 'route:admin-apps'
  | 'route:admin-acl'
  | 'route:admin-query-templates'
  | 'route:admin-visibility'
  | 'route:admin-audit'

export type AdminRouteId = Exclude<KnownRouteId, 'route:home'>

export type KnownRouteDefinition = {
  id: KnownRouteId
  path: string
  label: string
  description: string
  isAdmin: boolean
  sortOrder: number
}
