export type AvailableAppEntity = {
  id: string
  label: string
  description?: string
  basePath?: string
  objectApiName: string
}

export type AvailableApp = {
  id: string
  label: string
  description?: string
  entities: AvailableAppEntity[]
}

export type AvailableAppsResponse = {
  items: AvailableApp[]
}
