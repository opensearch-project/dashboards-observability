/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBoxOptionOption } from '@elastic/eui';

export interface PermissionsConfigurationProps {
  roles: Role[];
  selectedRoles: Role[];
  setSelectedRoles: React.Dispatch<React.SetStateAction<Role[]>>;
  layout: 'horizontal' | 'vertical';
  hasSecurityAccess: boolean;
}

export interface AssociatedObject {
  id: string;
  name: string;
  database: string;
  type: string;
  createdByIntegration: string;
  accelerations: string[];
}

export type Role = EuiComboBoxOptionOption;

export type DatasourceType = 'S3GLUE' | 'PROMETHEUS';

interface AsyncApiDataResponse {
  status: string;
  schema?: Array<{ name: string; type: string }>;
  datarows?: any;
  total?: number;
  size?: number;
  error?: string;
}

export interface AsyncApiResponse {
  data: {
    ok: boolean;
    resp: AsyncApiDataResponse;
  };
}

export type PollingCallback = (statusObj: AsyncApiResponse) => void;

export enum CachedDataSourceStatus {
  Updated = 'Updated',
  Failed = 'Failed',
  Empty = 'Empty',
  Loading = 'Loading',
}

export enum CachedDataSourceLoadingProgress {
  LoadingScheduled = 'Loading Scheduled',
  LoadingDatabases = 'Loading Databases',
  LoadingTables = 'Loading Tables',
  LoadingAccelerations = 'Loading Accelerations',
  LoadingError = 'Loading cache ran into error',
  LoadingCompleted = 'Loading Completed',
  LoadingStopped = 'Loading Stopped',
}

export interface CachedColumn {
  name: string;
  dataType: string;
}

export interface CachedIndex {
  indexName: string;
}

export interface CachedTable {
  name: string;
  columns: CachedColumn[];
  skippingIndex?: CachedIndex;
  coveringIndices: CachedIndex[];
}

export interface CachedMaterializedView {
  name: string;
}

export interface CachedDatabase {
  name: string;
  materializedViews: CachedMaterializedView[];
  tables: CachedTable[];
}

export interface CachedDataSource {
  name: string;
  lastUpdated: string; // Assuming date string in UTC format
  status: CachedDataSourceStatus;
  loadingProgress: string;
  databases: CachedDatabase[];
}

export interface CatalogCacheData {
  version: string;
  dataSources: CachedDataSource[];
}
