/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlatformTypeFromEnvironment } from '../../shared/utils/platform_utils';

/**
 * Generic response processor for transforming query responses (PPL, PromQL)
 * into standardized API response formats.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface PPLDataFrame {
  schema: Array<{
    name: string;
    type: string;
    values: any[];
  }>;
  fields: Array<{
    name: string;
    type: string;
    values: any[];
  }>;
  name: string;
  type: string;
  size: number;
  meta: any;
  jsonData?: Array<Record<string, any>>; // Added by PPLDataSource for jdbc format
  datarows?: any[][]; // Raw datarows from PPL response
}

export interface ServiceSummary {
  AttributeMaps: Array<Record<string, string>>;
  KeyAttributes: {
    Environment: string;
    Name: string;
    Type: string;
  };
}

export interface ListServicesResponse {
  EndTime: number;
  NextToken: string | null;
  ServiceSummaries: ServiceSummary[];
  StartTime: number;
}

export interface EnvironmentDetails {
  platform: string;
  cluster?: string;
  namespace?: string;
  autoScalingGroup?: string;
  taskDefinitionFamily?: string;
  functionName?: string;
}

// ============================================================================
// Group By Attributes Utilities
// ============================================================================

/**
 * Flattens a nested object into dot-notation key-value pairs
 * @param obj The nested object to flatten
 * @param prefix The prefix for the current level (used in recursion)
 * @returns Array of { path, value } objects
 * @example
 * Input: { telemetry: { sdk: { language: "python" } } }
 * Output: [{ path: "telemetry.sdk.language", value: "python" }]
 */
function flattenObject(obj: any, prefix: string = ''): Array<{ path: string; value: any }> {
  const result: Array<{ path: string; value: any }> = [];

  if (!obj || typeof obj !== 'object') {
    return result;
  }

  for (const [key, value] of Object.entries(obj)) {
    const newPath = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recurse for nested objects
      result.push(...flattenObject(value, newPath));
    } else {
      // Leaf value - add to result
      result.push({ path: newPath, value });
    }
  }

  return result;
}

/**
 * Builds an aggregated map of all unique groupByAttributes across multiple objects
 * @param groupByAttributesArray Array of groupByAttributes objects from multiple nodes
 * @returns Map of flattened paths to arrays of unique values
 * @example
 * Input: [
 *   { telemetry: { sdk: { language: "python" } } },
 *   { telemetry: { sdk: { language: "java" } } }
 * ]
 * Output: { "telemetry.sdk.language": ["python", "java"] }
 */
export function buildAvailableGroupByAttributes(
  groupByAttributesArray: any[]
): Record<string, string[]> {
  const attributeMap = new Map<string, Set<string>>();

  // Flatten each groupByAttributes object and collect values
  for (const groupByAttributes of groupByAttributesArray) {
    if (!groupByAttributes || typeof groupByAttributes !== 'object') {
      continue;
    }

    const flattened = flattenObject(groupByAttributes);
    for (const { path, value } of flattened) {
      if (value !== null && value !== undefined) {
        if (!attributeMap.has(path)) {
          attributeMap.set(path, new Set());
        }
        attributeMap.get(path)!.add(String(value));
      }
    }
  }

  // Convert Sets to sorted arrays
  const result: Record<string, string[]> = {};
  for (const [path, valueSet] of attributeMap.entries()) {
    result[path] = Array.from(valueSet).sort();
  }

  return result;
}

// ============================================================================
// Core Data Frame Utilities
// ============================================================================

/**
 * Transposes a PPL data_frame from column-oriented to row-oriented format
 * @param dataFrame PPL data_frame response
 * @returns Array of row objects
 */
export function transposeDataFrame(dataFrame: PPLDataFrame): Array<Record<string, any>> {
  // PPL facet with jdbc format already adds jsonData with row objects
  if (dataFrame?.jsonData && Array.isArray(dataFrame.jsonData)) {
    return dataFrame.jsonData;
  }

  // Fallback: transpose from fields format (for non-jdbc responses)
  if (!dataFrame?.fields || dataFrame.size === 0) {
    return [];
  }

  const { fields, size } = dataFrame;
  const rows: Array<Record<string, any>> = [];

  // Create row objects by iterating through indices
  for (let i = 0; i < size; i++) {
    const row: Record<string, any> = {};
    fields.forEach((field) => {
      row[field.name] = field.values[i];
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Extracts time range from timestamp array
 * @param timestamps Array of timestamp values (unix seconds or ISO strings)
 * @returns Object with StartTime and EndTime as unix timestamps
 */
export function extractTimeRange(timestamps: any[]): { StartTime: number; EndTime: number } {
  if (!timestamps || timestamps.length === 0) {
    const now = Math.floor(Date.now() / 1000);
    return { StartTime: now, EndTime: now };
  }

  // Convert all timestamps to unix seconds
  const unixTimestamps = timestamps.map((ts) => {
    if (typeof ts === 'number') {
      return ts;
    }
    if (typeof ts === 'string') {
      return Math.floor(new Date(ts).getTime() / 1000);
    }
    return 0;
  });

  const StartTime = Math.min(...unixTimestamps);
  const EndTime = Math.max(...unixTimestamps);

  return { StartTime, EndTime };
}

// ============================================================================
// Environment Parsing
// ============================================================================

/**
 * Parses environment type string into structured details
 * Handles patterns like:
 * - eks:cluster-name/namespace
 * - ec2:asg-name or ec2:default
 * - ecs:cluster-name
 * - lambda:default
 * - generic:default
 *
 * @param envString Environment type string
 * @returns Parsed environment details
 */
export function parseEnvironmentType(envString: string): EnvironmentDetails {
  if (!envString || typeof envString !== 'string') {
    return { platform: 'generic' };
  }

  const parts = envString.split(':');
  if (parts.length < 2) {
    return { platform: 'generic' };
  }

  const platform = parts[0].toLowerCase();
  const detail = parts[1];

  const result: EnvironmentDetails = { platform };

  switch (platform) {
    case 'eks':
      // Format: eks:cluster-name/namespace
      const eksParts = detail.split('/');
      result.cluster = eksParts[0];
      result.namespace = eksParts[1] || 'default';
      break;

    case 'ec2':
      // Format: ec2:asg-name or ec2:default
      if (detail !== 'default') {
        result.autoScalingGroup = detail;
      }
      break;

    case 'ecs':
      // Format: ecs:cluster-name
      result.cluster = detail;
      break;

    case 'lambda':
      // Format: lambda:default (function name comes from serviceName)
      break;

    case 'generic':
      // Format: generic:default
      break;

    default:
      // Unknown platform type
      break;
  }

  return result;
}

/**
 * Builds AttributeMaps array from platform type and environment details
 * @param platformType Platform type (AWS::EKS, AWS::EC2, etc.)
 * @param envDetails Parsed environment details
 * @param serviceName Service name (used for Lambda function name)
 * @returns Array of attribute map objects
 */
export function buildAttributeMaps(
  platformType: string,
  envDetails: EnvironmentDetails,
  serviceName?: string
): Array<Record<string, string>> {
  const attributeMaps: Array<Record<string, string>> = [];
  const primaryMap: Record<string, string> = { PlatformType: platformType };

  switch (envDetails.platform) {
    case 'eks':
      if (envDetails.cluster) {
        primaryMap['EKS.Cluster'] = envDetails.cluster;
      }
      if (envDetails.namespace) {
        primaryMap['K8s.Namespace'] = envDetails.namespace;
      }
      // Add workload if serviceName is provided
      if (serviceName) {
        primaryMap['K8s.Workload'] = serviceName;
      }
      break;

    case 'ec2':
      if (envDetails.autoScalingGroup) {
        primaryMap['EC2.AutoScalingGroup'] = envDetails.autoScalingGroup;
      }
      break;

    case 'ecs':
      if (envDetails.cluster) {
        primaryMap['ECS.Cluster'] = envDetails.cluster;
      }
      if (envDetails.taskDefinitionFamily) {
        primaryMap['ECS.TaskDefinitionFamily'] = envDetails.taskDefinitionFamily;
      }
      break;

    case 'lambda':
      if (serviceName) {
        primaryMap['Lambda.Function.Name'] = serviceName;
      }
      break;

    default:
      // Generic or unknown platform - just include PlatformType
      break;
  }

  attributeMaps.push(primaryMap);

  return attributeMaps;
}

// ============================================================================
// API-Specific Transformers
// ============================================================================

/**
 * Transforms PPL response for listServices API
 * @param pplResponse Raw PPL data_frame response
 * @returns Formatted listServices response
 */
export function transformListServicesResponse(pplResponse: PPLDataFrame): ListServicesResponse {
  const rows = transposeDataFrame(pplResponse);

  if (rows.length === 0) {
    return {
      StartTime: Math.floor(Date.now() / 1000),
      EndTime: Math.floor(Date.now() / 1000),
      NextToken: null,
      ServiceSummaries: [],
    };
  }

  // Extract time range
  const timestamps = rows.map((row) => row.timestamp).filter((ts) => ts !== undefined);
  const { StartTime, EndTime } = extractTimeRange(timestamps);

  // Group by unique service (serviceName + EnvironmentType combination)
  const serviceMap = new Map<string, any>();

  // Helper to add a service to the map from keyAttributes and groupByAttributes
  const addServiceToMap = (keyAttributes: any, groupByAttributes: any, fallbackName?: string) => {
    // Parse JSON strings if needed
    let parsedKeyAttributes = keyAttributes;
    if (typeof parsedKeyAttributes === 'string') {
      try {
        parsedKeyAttributes = JSON.parse(parsedKeyAttributes);
      } catch (e) {
        console.error('[DEBUG] transformListServicesResponse: Failed to parse keyAttributes:', e);
      }
    }

    let parsedGroupByAttributes = groupByAttributes;
    if (typeof parsedGroupByAttributes === 'string') {
      try {
        parsedGroupByAttributes = JSON.parse(parsedGroupByAttributes);
      } catch (e) {
        console.error(
          '[DEBUG] transformListServicesResponse: Failed to parse groupByAttributes:',
          e
        );
      }
    }

    const serviceName = parsedKeyAttributes?.name || fallbackName;
    const environmentType = parsedKeyAttributes?.environment;
    const platformType = environmentType
      ? getPlatformTypeFromEnvironment(environmentType)
      : 'Generic';

    if (!serviceName || !environmentType) {
      return;
    }

    const key = `${serviceName}::${environmentType}`;

    // Only add if not already present (deduplication)
    if (!serviceMap.has(key)) {
      const envDetails = parseEnvironmentType(environmentType);
      const attributeMaps = buildAttributeMaps(platformType, envDetails, serviceName);

      serviceMap.set(key, {
        AttributeMaps: attributeMaps,
        KeyAttributes: {
          Environment: environmentType,
          Name: serviceName,
          Type: 'Service',
        },
        GroupByAttributes: parsedGroupByAttributes || {},
      });
    }
  };

  rows.forEach((row, _index) => {
    // Add service from sourceNode
    addServiceToMap(
      row['sourceNode.keyAttributes'],
      row['sourceNode.groupByAttributes'],
      row['sourceNode.name']
    );

    // Add service from targetNode (may be null for leaf services)
    addServiceToMap(
      row['targetNode.keyAttributes'],
      row['targetNode.groupByAttributes'],
      row['targetNode.name']
    );
  });

  // Convert map to array and sort by service name for consistency
  const ServiceSummaries = Array.from(serviceMap.values()).sort((a, b) =>
    a.KeyAttributes.Name.localeCompare(b.KeyAttributes.Name)
  );

  // Build aggregated groupByAttributes map
  const allGroupByAttributes = ServiceSummaries.map((s) => s.GroupByAttributes).filter(Boolean);
  const availableGroupByAttributes = buildAvailableGroupByAttributes(allGroupByAttributes);

  return {
    StartTime,
    EndTime,
    NextToken: null,
    ServiceSummaries,
    AvailableGroupByAttributes: availableGroupByAttributes,
  };
}

/**
 * Transforms PPL response for getService API
 * @param pplResponse Raw PPL data_frame response
 * @returns Formatted getService response
 */
export function transformGetServiceResponse(pplResponse: PPLDataFrame): any {
  const rows = transposeDataFrame(pplResponse);

  if (rows.length === 0) {
    return {
      Service: null,
      StartTime: Math.floor(Date.now() / 1000),
      EndTime: Math.floor(Date.now() / 1000),
    };
  }

  // For getService, we expect a single service or the first match
  const row = rows[0];
  const timestamps = rows.map((r) => r.timestamp).filter((ts) => ts !== undefined);
  const { StartTime, EndTime } = extractTimeRange(timestamps);

  // Handle nested structure from query format
  // Parse JSON strings if needed
  let serviceKeyAttributes = row['sourceNode.keyAttributes'];
  if (typeof serviceKeyAttributes === 'string') {
    try {
      serviceKeyAttributes = JSON.parse(serviceKeyAttributes);
    } catch (e) {
      console.error(
        '[DEBUG] transformGetServiceResponse: Failed to parse sourceNode.keyAttributes:',
        e
      );
    }
  }

  let serviceGroupByAttributes = row['sourceNode.groupByAttributes'] || {};
  if (typeof serviceGroupByAttributes === 'string') {
    try {
      serviceGroupByAttributes = JSON.parse(serviceGroupByAttributes);
    } catch (e) {
      console.error(
        '[DEBUG] transformGetServiceResponse: Failed to parse sourceNode.groupByAttributes:',
        e
      );
    }
  }

  // Handle both nested keyAttributes format and flat field format
  const serviceName = serviceKeyAttributes?.name || row['sourceNode.name'];
  const environmentType = serviceKeyAttributes?.environment || row.environment;
  const serviceType = serviceKeyAttributes?.type || 'Service';

  if (!serviceName || !environmentType) {
    return {
      Service: null,
      StartTime,
      EndTime,
    };
  }

  const platformType = environmentType
    ? getPlatformTypeFromEnvironment(environmentType)
    : 'Generic';
  const envDetails = parseEnvironmentType(environmentType);
  const attributeMaps = buildAttributeMaps(platformType, envDetails, serviceName);

  return {
    Service: {
      AttributeMaps: attributeMaps,
      KeyAttributes: {
        Environment: environmentType,
        Name: serviceName,
        Type: serviceType,
      },
      GroupByAttributes: serviceGroupByAttributes,
    },
    StartTime,
    EndTime,
  };
}

/**
 * Transforms PPL response for listServiceOperations API
 * Handles unified document structure with sourceOperation.name and targetNode.keyAttributes
 * @param pplResponse Raw PPL data_frame response
 * @returns Formatted operations response
 */
export function transformListServiceOperationsResponse(pplResponse: PPLDataFrame): any {
  const rows = transposeDataFrame(pplResponse);

  // PPL query already filters for ServiceOperationDetail events, no need to filter again
  // Extract operations from new nested structure
  // Track both count and unique dependencies per operation
  const operationMap = new Map<string, { count: number; dependencies: Set<string> }>();

  rows.forEach((row) => {
    const operationName = row['sourceOperation.name'];

    if (operationName && operationName !== 'unknown') {
      // Get or create the operation entry
      let opData = operationMap.get(operationName);
      if (!opData) {
        opData = { count: 0, dependencies: new Set() };
        operationMap.set(operationName, opData);
      }
      opData.count += 1;

      // Extract remote service name for dependency counting
      const remoteServiceAttrs = row['targetNode.keyAttributes'];
      if (remoteServiceAttrs && remoteServiceAttrs.name && remoteServiceAttrs.name !== 'unknown') {
        opData.dependencies.add(remoteServiceAttrs.name);
      }
    }
  });

  const operations = Array.from(operationMap.entries()).map(([name, data]) => ({
    Name: name,
    Count: data.count,
    DependencyCount: data.dependencies.size,
  }));

  const timestamps = rows
    .map((r) => r.timestamp || r['@timestamp'])
    .filter((ts) => ts !== undefined);
  const { StartTime, EndTime } = extractTimeRange(timestamps);

  return {
    Operations: operations,
    StartTime,
    EndTime,
    NextToken: null,
  };
}

/**
 * Transforms PPL response for listServiceDependencies API
 * Handles unified document structure with targetNode.keyAttributes and sourceOperation/targetOperation
 * @param pplResponse Raw PPL data_frame response
 * @returns Formatted dependencies response
 */
export function transformListServiceDependenciesResponse(pplResponse: PPLDataFrame): any {
  const rows = transposeDataFrame(pplResponse);

  // PPL query already filters for ServiceOperationDetail events, no need to filter again
  // Extract operation-level dependencies using composite keys (service:operation)
  interface DependencyData {
    serviceName: string;
    environment: string;
    serviceOperation: string;
    remoteOperation: string;
    callCount: number;
  }

  const dependencyMap = new Map<string, DependencyData>();

  rows.forEach((row) => {
    const dependencyName = row['targetNode.keyAttributes']?.name;

    const dependencyEnv = row['targetNode.keyAttributes']?.environment || 'generic:default';

    const serviceOperation = row['sourceOperation.name'] || 'unknown';

    const remoteOperation = row['targetOperation.name'] || 'unknown';

    if (dependencyName && dependencyName !== 'unknown') {
      // Create composite key for service+operation combination
      const compositeKey = `${dependencyName}:${serviceOperation}:${remoteOperation}`;

      const existing = dependencyMap.get(compositeKey);
      if (existing) {
        existing.callCount++;
      } else {
        dependencyMap.set(compositeKey, {
          serviceName: dependencyName,
          environment: dependencyEnv,
          serviceOperation,
          remoteOperation,
          callCount: 1,
        });
      }
    }
  });

  const dependencies = Array.from(dependencyMap.values()).map((dep) => ({
    DependencyName: dep.serviceName,
    Environment: dep.environment,
    ServiceOperation: dep.serviceOperation,
    RemoteOperation: dep.remoteOperation,
    CallCount: dep.callCount,
  }));

  const timestamps = rows
    .map((r) => r.timestamp || r['@timestamp'])
    .filter((ts) => ts !== undefined);
  const { StartTime, EndTime } = extractTimeRange(timestamps);

  return {
    Dependencies: dependencies,
    StartTime,
    EndTime,
    NextToken: null,
  };
}

/**
 * Merges new groupByAttributes into existing ones without overwriting existing keys
 * @param existing Existing flattened groupByAttributes
 * @param newAttributes New groupByAttributes to merge (can be nested or already flattened)
 * @returns Merged groupByAttributes with existing keys preserved
 */
function mergeGroupByAttributes(
  existing: Record<string, string>,
  newAttributes: any
): Record<string, string> {
  const merged = { ...existing };

  if (!newAttributes || Object.keys(newAttributes).length === 0) {
    return merged;
  }

  // Flatten the new attributes if they're nested
  const flattened = flattenObject(newAttributes);

  // Only add keys that don't already exist
  flattened.forEach(({ path, value }) => {
    if (!(path in merged) && value !== null && value !== undefined) {
      merged[path] = String(value);
    }
  });

  return merged;
}

/**
 * Transforms PPL response for getServiceMap API
 * Handles unified document structure with sourceNode and targetNode
 * @param pplResponse Raw PPL data_frame response
 * @returns Formatted service map response with Nodes and Edges
 */
export function transformGetServiceMapResponse(pplResponse: PPLDataFrame): any {
  const rows = transposeDataFrame(pplResponse);

  if (rows.length === 0) {
    return {
      Nodes: [],
      Edges: [],
      AggregatedNodes: [],
      StartTime: Math.floor(Date.now() / 1000),
      EndTime: Math.floor(Date.now() / 1000),
      NextToken: null,
      AwsAccountId: null,
    };
  }

  // Build unique nodes from service data
  // Note: eventType filtering already done in PPL query WHERE clause
  const nodeMap = new Map<string, any>();
  const allGroupByAttributes: any[] = [];

  rows.forEach((row, _index) => {
    // Extract source node information
    // PPL returns fields with dot notation as string keys
    // Parse JSON strings if needed
    let serviceKeyAttributes = row['sourceNode.keyAttributes'];
    if (typeof serviceKeyAttributes === 'string') {
      try {
        serviceKeyAttributes = JSON.parse(serviceKeyAttributes);
      } catch (e) {
        console.error(
          '[DEBUG] transformGetServiceMapResponse: Failed to parse sourceNode.keyAttributes:',
          e
        );
      }
    }

    let serviceGroupByAttributes = row['sourceNode.groupByAttributes'] || {};
    if (typeof serviceGroupByAttributes === 'string') {
      try {
        serviceGroupByAttributes = JSON.parse(serviceGroupByAttributes);
      } catch (e) {
        console.error(
          '[DEBUG] transformGetServiceMapResponse: Failed to parse sourceNode.groupByAttributes:',
          e
        );
      }
    }

    // Handle both nested keyAttributes format and flat field format
    const serviceName = serviceKeyAttributes?.name || row['sourceNode.name'];
    const environmentType = serviceKeyAttributes?.environment || row.environment;
    const platformType = environmentType
      ? getPlatformTypeFromEnvironment(environmentType)
      : 'Generic';

    if (serviceName && environmentType) {
      const nodeKey = `${serviceName}::${environmentType}`;

      if (!nodeMap.has(nodeKey)) {
        const envDetails = parseEnvironmentType(environmentType);
        const attributeMaps = buildAttributeMaps(platformType, envDetails, serviceName);

        // Create node ID in the format: service/name=XXX|environment=YYY
        const nodeId = `service/name=${encodeURIComponent(
          serviceName
        )}|environment=${encodeURIComponent(environmentType)}`;

        // Flatten GroupByAttributes into dot notation
        const flattenedGroupByAttributes: Record<string, string> = {};
        if (serviceGroupByAttributes && Object.keys(serviceGroupByAttributes).length > 0) {
          const flattened = flattenObject(serviceGroupByAttributes);
          flattened.forEach(({ path, value }) => {
            flattenedGroupByAttributes[path] = String(value);
          });
        }

        nodeMap.set(nodeKey, {
          NodeId: nodeId,
          Name: serviceName,
          Type: 'AWS::CloudWatch::Service',
          KeyAttributes: {
            Environment: environmentType,
            Name: serviceName,
            Type: 'Service',
          },
          AttributeMaps: attributeMaps,
          GroupByAttributes: flattenedGroupByAttributes,
          StatisticReferences: {},
          AggregatedNodeId: null,
        });

        // Collect original groupByAttributes for aggregation
        if (serviceGroupByAttributes && Object.keys(serviceGroupByAttributes).length > 0) {
          allGroupByAttributes.push(serviceGroupByAttributes);
        }
      } else {
        // Node already exists, merge new groupByAttributes without overwriting existing keys
        const existingNode = nodeMap.get(nodeKey);
        if (serviceGroupByAttributes && Object.keys(serviceGroupByAttributes).length > 0) {
          existingNode.GroupByAttributes = mergeGroupByAttributes(
            existingNode.GroupByAttributes,
            serviceGroupByAttributes
          );
          // Also collect for aggregation
          allGroupByAttributes.push(serviceGroupByAttributes);
        }
      }
    }

    // Also add target node as a node if it exists (may be null for leaf services)
    const remoteServiceKeyAttributes = row['targetNode.keyAttributes'];
    const remoteServiceName = remoteServiceKeyAttributes?.name;
    const remoteEnvironment = remoteServiceKeyAttributes?.environment;
    const remoteServiceGroupByAttributes = row['targetNode.groupByAttributes'] || {};

    if (remoteServiceName && remoteEnvironment) {
      const depNodeKey = `${remoteServiceName}::${remoteEnvironment}`;

      if (!nodeMap.has(depNodeKey)) {
        const depPlatformType = getPlatformTypeFromEnvironment(remoteEnvironment);
        const depEnvDetails = parseEnvironmentType(remoteEnvironment);
        const depAttributeMaps = buildAttributeMaps(
          depPlatformType,
          depEnvDetails,
          remoteServiceName
        );

        const depNodeId = `service/name=${encodeURIComponent(
          remoteServiceName
        )}|environment=${encodeURIComponent(remoteEnvironment)}`;

        // Flatten GroupByAttributes into dot notation for remote service
        const flattenedRemoteGroupByAttributes: Record<string, string> = {};
        if (
          remoteServiceGroupByAttributes &&
          Object.keys(remoteServiceGroupByAttributes).length > 0
        ) {
          const flattened = flattenObject(remoteServiceGroupByAttributes);
          flattened.forEach(({ path, value }) => {
            flattenedRemoteGroupByAttributes[path] = String(value);
          });
        }

        nodeMap.set(depNodeKey, {
          NodeId: depNodeId,
          Name: remoteServiceName,
          Type: 'AWS::CloudWatch::Service',
          KeyAttributes: {
            Environment: remoteEnvironment,
            Name: remoteServiceName,
            Type: 'Service',
          },
          AttributeMaps: depAttributeMaps,
          GroupByAttributes: flattenedRemoteGroupByAttributes,
          StatisticReferences: {},
          AggregatedNodeId: null,
        });

        // Collect original groupByAttributes for aggregation
        if (
          remoteServiceGroupByAttributes &&
          Object.keys(remoteServiceGroupByAttributes).length > 0
        ) {
          allGroupByAttributes.push(remoteServiceGroupByAttributes);
        }
      } else {
        // Node already exists, merge new groupByAttributes without overwriting existing keys
        const existingNode = nodeMap.get(depNodeKey);
        if (
          remoteServiceGroupByAttributes &&
          Object.keys(remoteServiceGroupByAttributes).length > 0
        ) {
          existingNode.GroupByAttributes = mergeGroupByAttributes(
            existingNode.GroupByAttributes,
            remoteServiceGroupByAttributes
          );
          // Also collect for aggregation
          allGroupByAttributes.push(remoteServiceGroupByAttributes);
        }
      }
    }
  });

  // Build edges from service relationships
  const edges = rows
    .map((row, index) => {
      // Parse JSON strings if needed
      let serviceKeyAttributes = row['sourceNode.keyAttributes'];
      if (typeof serviceKeyAttributes === 'string') {
        try {
          serviceKeyAttributes = JSON.parse(serviceKeyAttributes);
        } catch (e) {
          console.error(
            '[DEBUG] transformGetServiceMapResponse (edges): Failed to parse sourceNode.keyAttributes:',
            e
          );
        }
      }

      let remoteServiceKeyAttributes = row['targetNode.keyAttributes'];
      if (typeof remoteServiceKeyAttributes === 'string') {
        try {
          remoteServiceKeyAttributes = JSON.parse(remoteServiceKeyAttributes);
        } catch (e) {
          console.error(
            '[DEBUG] transformGetServiceMapResponse (edges): Failed to parse targetNode.keyAttributes:',
            e
          );
        }
      }

      // Handle both nested keyAttributes format and flat field format
      const serviceName = serviceKeyAttributes?.name || row['sourceNode.name'];
      const environmentType = serviceKeyAttributes?.environment || row.environment;
      const remoteServiceName = remoteServiceKeyAttributes?.name || row['targetNode.name'];
      const remoteEnvironment =
        remoteServiceKeyAttributes?.environment || row['targetNode.environment'];

      if (!serviceName || !environmentType || !remoteServiceName || !remoteEnvironment) {
        return null;
      }

      const sourceNodeId = `service/name=${encodeURIComponent(
        serviceName
      )}|environment=${encodeURIComponent(environmentType)}`;
      const destNodeId = `service/name=${encodeURIComponent(
        remoteServiceName
      )}|environment=${encodeURIComponent(remoteEnvironment)}`;

      // Create a unique edge ID
      const edgeId = `edge-${index}-${serviceName}-${remoteServiceName}`;

      return {
        EdgeId: edgeId,
        SourceNodeId: sourceNodeId,
        DestinationNodeId: destNodeId,
        StatisticReferences: {},
      };
    })
    .filter((edge) => edge !== null);

  const timestamps = rows.map((r) => r.timestamp).filter((ts) => ts !== undefined);
  const { StartTime, EndTime } = extractTimeRange(timestamps);

  const nodes = Array.from(nodeMap.values());

  // Build aggregated AvailableGroupByAttributes map
  const availableGroupByAttributes = buildAvailableGroupByAttributes(allGroupByAttributes);

  return {
    Nodes: nodes,
    Edges: edges,
    AggregatedNodes: [],
    AvailableGroupByAttributes: availableGroupByAttributes,
    StartTime,
    EndTime,
    NextToken: null,
    AwsAccountId: null,
  };
}

/**
 * Transforms PPL response for getServiceData API (metrics/stats)
 * @param pplResponse Raw PPL data_frame response
 * @param dataSource Type of service data (SERVICE_OPERATION, SERVICE_DEPENDENCY, SERVICE_RUNTIME)
 * @returns Formatted service data response
 */
export function transformGetServiceDataResponse(
  pplResponse: PPLDataFrame,
  dataSource?: string
): any {
  const rows = transposeDataFrame(pplResponse);

  const timestamps = rows.map((r) => r.timestamp).filter((ts) => ts !== undefined);
  const { StartTime, EndTime } = extractTimeRange(timestamps);

  // Transform based on data source type to match CloudWatch Application Signals API format
  let serviceData: any[] = [];

  switch (dataSource) {
    case 'SERVICE_OPERATION':
      serviceData = rows.map((row) => ({
        Attributes: {
          OperationName: row.localOperation || row.operation,
        },
        Data: [],
        MetricReferences: [],
        SliReport: null,
      }));
      break;

    case 'SERVICE_RUNTIME':
      serviceData = rows.map((row) => ({
        Attributes: {
          ServiceName: row.serviceName,
        },
        Data: [],
        MetricReferences: [],
        SliReport: null,
      }));
      break;

    default:
      // Generic data format - wrap in ServiceData structure
      serviceData = rows.map((row) => ({
        Attributes: row,
        Data: [],
        MetricReferences: [],
        SliReport: null,
      }));
      break;
  }

  return {
    ServiceData: serviceData,
    TotalCount: serviceData.length,
    DataSource: dataSource,
    StartTime,
    EndTime,
    NextToken: null,
  };
}

// ============================================================================
// Response Processor Class (Optional - for future state management)
// ============================================================================

/**
 * Transforms PPL stats aggregation response for listServices API
 * Handles stats query: stats count() by sourceNode.keyAttributes.name, sourceNode.keyAttributes.environment, sourceNode.groupByAttributes
 * @param pplResponse Raw PPL data_frame response from stats aggregation
 * @returns Array of service summaries
 */
export function transformListServicesStatsResponse(pplResponse: PPLDataFrame): any[] {
  const rows = transposeDataFrame(pplResponse);

  if (rows.length === 0) {
    return [];
  }

  // Each row represents a unique service (from stats grouping)
  const services = rows
    .map((row) => {
      // Stats query groups by these field names
      const serviceName = row['sourceNode.keyAttributes.name'];
      const environment = row['sourceNode.keyAttributes.environment'];
      const groupByAttributes = row['sourceNode.groupByAttributes'] || {};

      if (!serviceName || !environment) {
        return null;
      }

      const platformType = getPlatformTypeFromEnvironment(environment);
      const envDetails = parseEnvironmentType(environment);
      const attributeMaps = buildAttributeMaps(platformType, envDetails, serviceName);

      return {
        KeyAttributes: {
          Name: serviceName,
          Environment: environment,
          Type: 'Service',
        },
        AttributeMaps: attributeMaps,
        GroupByAttributes: groupByAttributes,
      };
    })
    .filter((service) => service !== null);

  return services;
}

export class ResponseProcessor {
  static transformListServices = transformListServicesResponse; // Use non-stats version (matches AWS plugin)
  static transformGetService = transformGetServiceResponse;
  static transformListServiceOperations = transformListServiceOperationsResponse;
  static transformListServiceDependencies = transformListServiceDependenciesResponse;
  static transformGetServiceMap = transformGetServiceMapResponse;
  static transformGetServiceData = transformGetServiceDataResponse;

  // Utility methods
  static transposeDataFrame = transposeDataFrame;
  static parseEnvironmentType = parseEnvironmentType;
  static buildAttributeMaps = buildAttributeMaps;
  static extractTimeRange = extractTimeRange;
  static buildAvailableGroupByAttributes = buildAvailableGroupByAttributes;
}
