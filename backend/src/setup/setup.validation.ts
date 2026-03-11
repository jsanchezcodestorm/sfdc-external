import { BadRequestException } from '@nestjs/common';

import type { SetupSalesforceConfig } from './setup.types';

const DEFAULT_SALESFORCE_LOGIN_URL = 'https://login.salesforce.com';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSiteName(value: unknown, fieldName = 'siteName'): string {
  return normalizeString(value, fieldName, 128);
}

export function normalizeAdminEmail(value: unknown, fieldName = 'adminEmail'): string {
  const normalized = normalizeString(value, fieldName, 320).toLowerCase();

  if (!EMAIL_PATTERN.test(normalized)) {
    throw new BadRequestException(`${fieldName} must be a valid email address`);
  }

  return normalized;
}

export function normalizeBootstrapPassword(
  value: unknown,
  fieldName = 'bootstrapPassword'
): string {
  return normalizeString(value, fieldName, 512);
}

export function normalizeSalesforceSetupConfig(
  value: unknown,
  fieldName = 'salesforce'
): SetupSalesforceConfig {
  const payload = requireObject(value, `${fieldName} must be an object`);
  const mode = normalizeString(payload.mode, `${fieldName}.mode`, 32).toLowerCase();

  if (mode === 'username-password') {
    return {
      mode: 'username-password',
      loginUrl: normalizeUrl(
        payload.loginUrl ?? DEFAULT_SALESFORCE_LOGIN_URL,
        `${fieldName}.loginUrl`
      ),
      username: normalizeString(payload.username, `${fieldName}.username`, 320),
      password: normalizeString(payload.password, `${fieldName}.password`, 512),
      securityToken: asOptionalString(payload.securityToken, `${fieldName}.securityToken`, 512),
    };
  }

  if (mode === 'access-token') {
    return {
      mode: 'access-token',
      instanceUrl: normalizeUrl(payload.instanceUrl, `${fieldName}.instanceUrl`),
      accessToken: normalizeString(payload.accessToken, `${fieldName}.accessToken`, 2048),
    };
  }

  throw new BadRequestException(
    `${fieldName}.mode must be either username-password or access-token`
  );
}

function normalizeUrl(value: unknown, fieldName: string): string {
  const normalized = normalizeString(value, fieldName, 512);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new BadRequestException(`${fieldName} must be a valid URL`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException(`${fieldName} must use http or https`);
  }

  return parsed.toString().replace(/\/$/, '');
}

function normalizeString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} is required`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new BadRequestException(`${fieldName} is required`);
  }

  if (normalized.length > maxLength) {
    throw new BadRequestException(`${fieldName} must be at most ${maxLength} characters`);
  }

  return normalized;
}

function asOptionalString(value: unknown, fieldName: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > maxLength) {
    throw new BadRequestException(`${fieldName} must be at most ${maxLength} characters`);
  }

  return normalized;
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new BadRequestException(message);
  }

  return value as Record<string, unknown>;
}
