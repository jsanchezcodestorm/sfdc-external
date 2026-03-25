import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { platformAuthJson } from '../platform/platform-clients';

import type {
  AuthAdminProviderDetailResponse,
  AuthAdminProviderResponse,
  AuthAdminProvidersResponse,
  AuthProvidersResponse,
  AuthProviderAdminInput
} from './auth.types';

@Injectable()
export class AuthProviderAdminService {
  listProviders(): Promise<AuthAdminProvidersResponse> {
    return platformAuthJson<AuthAdminProvidersResponse>('/auth/admin/providers');
  }

  getProvider(
    providerId: string,
    _request: Pick<Request, 'headers' | 'protocol' | 'get'>
  ): Promise<AuthAdminProviderDetailResponse> {
    return platformAuthJson<AuthAdminProviderDetailResponse>(
      `/auth/admin/providers/${encodeURIComponent(providerId)}`
    );
  }

  getPublicProviders(): Promise<AuthProvidersResponse> {
    return platformAuthJson<AuthProvidersResponse>('/auth/providers');
  }

  updateProvider(
    providerId: string,
    input: AuthProviderAdminInput
  ): Promise<AuthAdminProviderResponse> {
    return platformAuthJson<AuthAdminProviderResponse>(
      `/auth/admin/providers/${encodeURIComponent(providerId)}`,
      {
        method: 'PUT',
        body: {
          provider: input
        }
      }
    );
  }
}
