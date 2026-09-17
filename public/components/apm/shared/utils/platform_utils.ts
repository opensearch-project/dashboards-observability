/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Platform type mapping for service map nodes
 */
export const PLATFORM_TYPE_MAP: Record<string, string> = {
  'AWS::Lambda': 'Lambda',
  'AWS::EKS': 'EKS',
  'AWS::ECS': 'ECS',
  'AWS::EC2': 'EC2',
  Generic: 'Generic',
};

/**
 * Get platform display name from platform type
 * @param platformType - Platform type string (e.g., "AWS::EKS")
 * @returns Display name (e.g., "EKS")
 */
export function getPlatformDisplayName(platformType: string): string {
  return PLATFORM_TYPE_MAP[platformType] || 'Generic';
}

/**
 * Get platform type from environment string
 * @param environment - Environment string (e.g., "eks:cluster/namespace")
 * @returns Platform type (e.g., "AWS::EKS")
 */
export function getPlatformTypeFromEnvironment(environment: string): string {
  if (!environment || typeof environment !== 'string') {
    return 'Generic';
  }

  const platform = environment.split(':')[0]?.toLowerCase();

  switch (platform) {
    case 'eks':
      return 'AWS::EKS';
    case 'ec2':
      return 'AWS::EC2';
    case 'ecs':
      return 'AWS::ECS';
    case 'lambda':
      return 'AWS::Lambda';
    default:
      return 'Generic';
  }
}

/**
 * Icon keys (from the @osd/apm-topology ICONS map) used to represent non-service
 * dependency nodes synthesized by the service-map processor.
 */
const NODE_TYPE_ICON_MAP: Record<string, string> = {
  database: 'AWS::RDS',
  messaging: 'Kafka',
  // CloudFront's globe/edge icon reads as "outbound to the internet"; the library
  // has no dedicated external/globe icon (Remote::Endpoint falls back to the gear).
  external: 'AWS::CloudFront',
};

/**
 * Human-readable subtitle for a dependency node type.
 */
const NODE_TYPE_LABEL_MAP: Record<string, string> = {
  database: 'Database',
  messaging: 'Messaging',
  external: 'External',
};

/**
 * True when the node type is an inferred dependency (database / messaging / external)
 * rather than an instrumented service.
 * @param nodeType - The node's type
 */
export function isDependencyType(nodeType: string | undefined): boolean {
  const key = (nodeType || '').toLowerCase();
  return key === 'database' || key === 'messaging' || key === 'external';
}

/**
 * Node kind label for the catalog "Type" column: "Database" / "Messaging" /
 * "External" for dependencies, otherwise "Service".
 * @param nodeType - The node's type
 */
export function getNodeTypeLabel(nodeType: string | undefined): string {
  return NODE_TYPE_LABEL_MAP[(nodeType || '').toLowerCase()] || 'Service';
}

/**
 * Resolve the icon key for a service-map node. Non-service dependency nodes
 * (database / messaging / external) map to a dedicated icon; everything else
 * falls back to the environment-derived platform type.
 * @param nodeType - The node's KeyAttributes.Type (service / database / messaging / external)
 * @param environment - Environment string, used for the service fallback
 * @returns Icon key understood by getIcon()
 */
export function getNodeIconType(nodeType: string | undefined, environment: string): string {
  const key = (nodeType || '').toLowerCase();
  return NODE_TYPE_ICON_MAP[key] || getPlatformTypeFromEnvironment(environment);
}

/**
 * Subtitle label for a service-map node: the dependency kind for non-service
 * nodes, otherwise the environment-derived platform type.
 * @param nodeType - The node's KeyAttributes.Type
 * @param environment - Environment string, used for the service fallback
 * @returns Display subtitle
 */
export function getNodeSubtitle(nodeType: string | undefined, environment: string): string {
  const key = (nodeType || '').toLowerCase();
  return NODE_TYPE_LABEL_MAP[key] || getPlatformTypeFromEnvironment(environment);
}

/**
 * Convert OpenSearch path to Prometheus label format
 * @param path - Dot-notation path (e.g., "telemetry.sdk.language")
 * @returns Prometheus label format (e.g., "telemetry_sdk_language")
 */
export function toPrometheusLabel(path: string): string {
  return path.replace(/\./g, '_');
}
