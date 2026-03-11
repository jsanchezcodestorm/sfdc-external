export function buildAuthAdminProvidersPath(): string {
  return '/admin/auth/providers'
}

export function buildAuthAdminProviderCreatePath(): string {
  return '/admin/auth/providers/__new__'
}

export function buildAuthAdminProviderEditPath(providerId: string): string {
  return `/admin/auth/providers/${encodeURIComponent(providerId)}/edit`
}

export function buildAuthAdminLocalCredentialsPath(): string {
  return '/admin/auth/local-credentials'
}
