/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ErrorRateThreshold } from '../constants';

/**
 * Node health status for CelestialMap visualization
 */
export interface NodeHealth {
  breached: number;
  recovered: number;
  total: number;
  status: 'ok' | 'recovered' | 'breached';
}

/**
 * Node metrics for CelestialMap visualization
 */
export interface NodeMetrics {
  requests: number;
  faults5xx: number;
  errors4xx: number;
}

/**
 * CelestialMap node data structure
 */
export interface CelestialNodeData {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  isGroup: boolean;
  keyAttributes: Record<string, string>;
  groupByAttributes?: Record<string, string>;
  isInstrumented: boolean;
  health: NodeHealth;
  metrics: NodeMetrics;
}

/**
 * CelestialMap node structure for React Flow
 */
export interface CelestialMapNode {
  id: string;
  type: 'celestialNode';
  position: { x: number; y: number };
  data: CelestialNodeData;
}

/**
 * CelestialMap edge structure
 * Extends React Flow Edge with optional label properties
 */
export interface CelestialMapEdge {
  id: string;
  source: string;
  target: string;
  /** Arrow marker at end of edge */
  markerEnd?: {
    type: string;
    width: number;
    height: number;
  };
  /** Edge label text */
  label?: string;
  /** Label style (fontSize, fontWeight, etc.) */
  labelStyle?: React.CSSProperties;
  /** Label background style */
  labelBgStyle?: React.CSSProperties;
  /** Label background padding [horizontal, vertical] */
  labelBgPadding?: [number, number];
  /** Whether the edge is animated (moving dashes) */
  animated?: boolean;
  /** Whether the edge is selected */
  selected?: boolean;
  /** Custom edge styles */
  style?: React.CSSProperties;
}

/**
 * Metrics for a service-to-service connection (edge)
 */
export interface EdgeMetrics {
  /** Edge identifier in format "sourceService::sourceEnv->targetService::targetEnv" */
  edgeId: string;
  /** Source service name */
  sourceService: string;
  /** Source environment */
  sourceEnvironment: string;
  /** Target service name */
  targetService: string;
  /** Total request count */
  requestCount: number;
  /** P99 latency in milliseconds */
  latencyP99: number;
  /** Total fault count - 5xx errors */
  faultCount: number;
  /** Total error count - 4xx errors */
  errorCount: number;
}

/**
 * State for selected edge flyout
 */
export interface SelectedEdgeState {
  /** Edge identifier */
  edgeId: string;
  /** Source service name */
  sourceService: string;
  /** Source environment */
  sourceEnvironment: string;
  /** Target service name */
  targetService: string;
  /** Source node ID (for map focusing) */
  sourceNodeId: string;
  /** Target node ID (for map focusing) */
  targetNodeId: string;
}

/**
 * Filter state for the Application Map page
 */
export interface ApplicationMapFilters {
  /** Fault rate (5xx) threshold buckets (OR logic - show nodes matching ANY selected threshold) */
  faultRateThresholds: ErrorRateThreshold[];
  /** Error rate (4xx) threshold buckets (OR logic - show nodes matching ANY selected threshold) */
  errorRateThresholds: ErrorRateThreshold[];
  /** Environment values to filter by (raw environment strings) */
  environments: string[];
  /** Search query for filtering by service name */
  searchQuery: string;
  /** GroupBy attribute path (e.g., "telemetry.sdk.language") or null for no grouping */
  groupBy: string | null;
}

/**
 * Navigation level for hierarchical service map view
 * - 'application': Root level showing aggregated application node
 * - 'groupBy': Shows group nodes for each unique attribute value
 * - 'groupByValue': Shows services within a selected group
 * - 'services': Shows all services (no grouping)
 */
export type NavigationLevel = 'application' | 'groupBy' | 'groupByValue' | 'services';

/**
 * Breadcrumb item for navigation trail
 */
export interface MapBreadcrumb {
  id: string;
  label: string;
}

/**
 * Navigation state for hierarchical map view
 */
export interface MapNavigationState {
  level: NavigationLevel;
  breadcrumbs: MapBreadcrumb[];
  /** Group by attribute path (e.g., "telemetry.sdk.language") */
  groupByAttribute?: string | null;
  /** Selected group value (e.g., "cpp") */
  groupByValue?: string | null;
}

/**
 * Response from PPL service map query (transformed)
 */
export interface ServiceMapNode {
  NodeId: string;
  Name: string;
  Type: string;
  KeyAttributes: {
    Environment: string;
    Name: string;
    Type: string;
  };
  AttributeMaps: Array<Record<string, string>>;
  GroupByAttributes: Record<string, string>;
  StatisticReferences: Record<string, any>;
  AggregatedNodeId: string | null;
}

/**
 * Response from PPL service map query (edges)
 */
export interface ServiceMapEdge {
  EdgeId: string;
  SourceNodeId: string;
  DestinationNodeId: string;
  StatisticReferences: Record<string, any>;
}

/**
 * Full service map response from PPL query
 */
export interface ServiceMapResponse {
  Nodes: ServiceMapNode[];
  Edges: ServiceMapEdge[];
  AggregatedNodes: any[];
  AvailableGroupByAttributes: Record<string, string[]>;
  StartTime: number;
  EndTime: number;
  NextToken: string | null;
  AwsAccountId: string | null;
}

/**
 * RED metrics for a single service node
 */
export interface ServiceMapNodeMetrics {
  /** Latency time series data points */
  latency: MetricDataPoint[];
  /** Average latency in ms */
  avgLatency: number;
  /** P99 latency time series */
  latencyP99: MetricDataPoint[];
  avgLatencyP99: number;
  /** P90 latency time series */
  latencyP90: MetricDataPoint[];
  avgLatencyP90: number;
  /** P50 latency time series */
  latencyP50: MetricDataPoint[];
  avgLatencyP50: number;
  /** Throughput (requests) time series */
  throughput: MetricDataPoint[];
  /** Average throughput */
  avgThroughput: number;
  /** Failure ratio time series (percentage) */
  failureRatio: MetricDataPoint[];
  /** Average failure ratio (percentage) */
  avgFailureRatio: number;
  /** Faults (5xx) time series */
  faults: MetricDataPoint[];
  /** Total faults count */
  totalFaults: number;
  /** Errors (4xx) time series */
  errors: MetricDataPoint[];
  /** Total errors count */
  totalErrors: number;
  /** Total requests count */
  totalRequests: number;
}

/**
 * Metric data point for time series
 */
export interface MetricDataPoint {
  timestamp: number;
  value: number;
}

/**
 * Selected node state for details panel
 */
export interface SelectedNodeState {
  nodeId: string;
  serviceName: string;
  environment: string;
  platformType: string;
  groupByAttributes?: Record<string, string>;
}

/**
 * Props for the service details panel
 */
export interface ServiceDetailsPanelProps {
  node: SelectedNodeState;
  metrics: ServiceMapNodeMetrics | null;
  isLoading: boolean;
  timeRange: { from: string; to: string };
  prometheusConnectionId: string;
  onClose: () => void;
  onViewDetails: (serviceName: string, environment: string) => void;
  refreshTrigger?: number;
}

/**
 * Platform icon mapping type
 */
export type PlatformIconType =
  | 'AWS::Lambda'
  | 'AWS::DynamoDB'
  | 'AWS::RDS'
  | 'AWS::APIGateway'
  | 'AWS::S3'
  | 'AWS::SQS'
  | 'AWS::SNS'
  | 'AWS::EKS'
  | 'AWS::ECS'
  | 'AWS::EC2'
  | 'Generic';

/**
 * Initial filter state
 */
export const DEFAULT_FILTERS: ApplicationMapFilters = {
  faultRateThresholds: [],
  errorRateThresholds: [],
  environments: [],
  searchQuery: '',
  groupBy: null,
};

/**
 * Initial navigation state (no World breadcrumb - handled in component)
 */
export const DEFAULT_NAVIGATION_STATE: MapNavigationState = {
  level: 'application',
  breadcrumbs: [],
  groupByAttribute: null,
  groupByValue: null,
};
