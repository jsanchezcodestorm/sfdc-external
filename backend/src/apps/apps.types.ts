export interface AppConfig {
  id: string;
  label: string;
  description?: string;
  sortOrder: number;
  entityIds: string[];
  permissionCodes: string[];
}

export interface AppAdminSummary {
  id: string;
  label: string;
  description?: string;
  sortOrder: number;
  entityCount: number;
  permissionCount: number;
  updatedAt: string;
}

export interface AppAdminListResponse {
  items: AppAdminSummary[];
}

export interface AppAdminResponse {
  app: AppConfig;
}

export interface AvailableAppEntity {
  id: string;
  label: string;
  description?: string;
  basePath?: string;
  objectApiName: string;
  keyPrefix?: string;
}

export interface AvailableApp {
  id: string;
  label: string;
  description?: string;
  entities: AvailableAppEntity[];
}

export interface AppsAvailableResponse {
  items: AvailableApp[];
}
