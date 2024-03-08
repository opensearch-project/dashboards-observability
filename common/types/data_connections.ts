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

export type AccelerationIndexType = 'skipping' | 'covering' | 'materialized';

export type LoadCacheType = 'databases' | 'tables' | 'accelerations';

export enum CachedDataSourceStatus {
  Updated = 'Updated',
  Failed = 'Failed',
  Empty = 'Empty',
}

export interface CachedColumn {
  name: string;
  dataType: string;
}

export interface CachedTable {
  name: string;
  columns: CachedColumn[];
}

export interface CachedDatabase {
  name: string;
  tables: CachedTable[];
  lastUpdated: string; // Assuming date string in UTC format
  status: CachedDataSourceStatus;
}

export interface CachedDataSource {
  name: string;
  lastUpdated: string; // Assuming date string in UTC format
  status: CachedDataSourceStatus;
  databases: CachedDatabase[];
}

export interface DataSourceCacheData {
  version: string;
  dataSources: CachedDataSource[];
}

export interface CachedAccelerations {
  flintIndexName: string;
  type: AccelerationIndexType;
  database: string;
  table: string;
  indexName: string;
  autoRefresh: boolean;
  status: string;
}

export interface AccelerationsCacheData {
  version: string;
  accelerations: CachedAccelerations[];
  lastUpdated: string; // Assuming date string in UTC format
  status: CachedDataSourceStatus;
}

export interface PollingSuccessResult {
  schema: Array<{ name: string; type: string }>;
  datarows: Array<Array<string | number | boolean>>;
}

export type AsyncPollingResult = PollingSuccessResult | null;
