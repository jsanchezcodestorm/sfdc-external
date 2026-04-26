import type { EntityConfig } from '../entities.types';

export interface SalesforceObjectSuggestion {
  name: string;
  label: string;
  custom: boolean;
}

export interface SalesforceObjectSuggestionCache {
  fetchedAtMs: number;
  items: SalesforceObjectSuggestion[];
}

export interface SalesforceFieldSuggestion {
  name: string;
  label: string;
  type: string;
  filterable: boolean;
}

export interface SalesforceFieldDescribe {
  name: string;
  label: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  filterable: boolean;
  defaultedOnCreate?: boolean;
  calculated?: boolean;
  autoNumber?: boolean;
  relationshipName?: string;
  referenceTo?: string[];
}

export interface SalesforceFieldSuggestionCache {
  fetchedAtMs: number;
  items: SalesforceFieldSuggestion[];
}

export interface EntityAdminBootstrapPreviewResponse {
  entity: EntityConfig;
  warnings: string[];
}
