/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// Dataset configuration for PPL queries
export interface DatasetConfig {
  id: string;
  title: string;
  dataSource?: {
    id: string;
    type: string;
  };
}

// PPL Client operation request interfaces
export interface BaseQueryRequest {
  queryIndex: string;
  startTime: string;
  endTime: string;
  dataset: DatasetConfig;
}

export interface ListServicesRequest extends BaseQueryRequest {
  maxResults?: number;
  nextToken?: string;
}

export interface GetServiceRequest extends BaseQueryRequest {
  keyAttributes: Record<string, string>;
}

export interface GetServiceDataRequest extends BaseQueryRequest {
  keyAttributes: Record<string, string>;
  dataSource?: string;
  filters?: any[];
  filterOperator?: string;
  sort?: any;
  maxResults?: number;
  nextToken?: string;
}

export interface ListServiceOperationsRequest extends BaseQueryRequest {
  keyAttributes: Record<string, string>;
  maxResults?: number;
  nextToken?: string;
}

export interface ListServiceDependenciesRequest extends BaseQueryRequest {
  keyAttributes: Record<string, string>;
  maxResults?: number;
  nextToken?: string;
}

export interface GetServiceMapRequest extends BaseQueryRequest {
  nextToken?: string;
  viewBy?: string;
  viewMode?: string;
  platform?: string[];
  environment?: string[];
  instrumentationType?: string[];
  group?: string[];
}

// Response interfaces
export interface ServiceSummary {
  name: string;
  type?: string;
  lastSeenTimestamp?: string;
  // Add more fields as needed based on actual PPL responses
}

export interface ServiceDetails extends ServiceSummary {
  keyAttributes: Record<string, string>;
  operations?: OperationSummary[];
  dependencies?: DependencySummary[];
}

export interface OperationSummary {
  name: string;
  type?: string;
  keyAttributes?: Record<string, string>;
}

export interface DependencySummary {
  upstreamService?: string;
  downstreamService?: string;
  type?: string;
  keyAttributes?: Record<string, string>;
}

export interface ServiceMapNode {
  id: string;
  name: string;
  type?: string;
  keyAttributes?: Record<string, string>;
}

export interface ServiceMapEdge {
  source: string;
  target: string;
  type?: string;
}

export interface ServiceMapResponse {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
  nextToken?: string;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  totalCount?: number;
}
