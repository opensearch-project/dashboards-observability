/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import * as apmTopology from '@osd/apm-topology';

/**
 * Icon key for a dependency's system, from @osd/apm-topology (OpenSearch-Dashboards#12771):
 * the system's open-source brand mark (e.g. PostgreSQL, Kafka) or its type's generic glyph.
 * Absent in older OpenSearch-Dashboards builds, which keep the per-type icons below.
 */
const getDependencyIconKey: ((type?: string, system?: string) => string) | undefined = (
  apmTopology as { getDependencyIconKey?: (type?: string, system?: string) => string }
).getDependencyIconKey;

// data-prepper names AWS SDK dependencies `AWS::{service}`; these have AWS icons.
const AWS_SERVICE_SYSTEMS: Record<string, string> = {
  'AWS::DynamoDB': 'aws.dynamodb',
  'AWS::Redshift': 'aws.redshift',
  'AWS::SNS': 'aws.sns',
  'AWS::SQS': 'aws_sqs',
};

/**
 * The OTel system of a dependency node, read from its name as data-prepper builds it:
 * `{system}:{host}`, `{system}:{namespace}` or `{system}` for databases, and
 * `{system}:{destination}` for brokers. Undefined for external endpoints and unknown shapes;
 * a name that is not system-prefixed (e.g. a host) simply matches no system icon.
 * @param nodeType - The node's type
 * @param name - The node's name
 */
export function getDependencySystemFromName(
  nodeType: string | undefined,
  name: string | undefined
): string | undefined {
  if (!name) return undefined;
  if (AWS_SERVICE_SYSTEMS[name]) return AWS_SERVICE_SYSTEMS[name];
  const type = (nodeType || '').toLowerCase();
  if (type !== 'database' && type !== 'messaging') return undefined;
  if (name.startsWith('AWS::')) return undefined;
  const sep = name.indexOf(':');
  return sep > 0 ? name.slice(0, sep) : name;
}

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
 * Per-type icon keys (from the @osd/apm-topology ICONS map) for dependency nodes, used only
 * with OpenSearch-Dashboards builds whose @osd/apm-topology has no getDependencyIconKey.
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
  database: i18n.translate('observability.apm.nodeType.database', {
    defaultMessage: 'Database',
  }),
  messaging: i18n.translate('observability.apm.nodeType.messaging', {
    defaultMessage: 'Messaging',
  }),
  external: i18n.translate('observability.apm.nodeType.external', {
    defaultMessage: 'External',
  }),
};

const SERVICE_TYPE_LABEL = i18n.translate('observability.apm.nodeType.service', {
  defaultMessage: 'Service',
});

const OTHER_DEPENDENCY_TYPE_LABEL = i18n.translate('observability.apm.nodeType.otherDependency', {
  defaultMessage: 'Other dependency',
});

/** Node types, in the order the catalog Type filter lists them. */
export const NODE_TYPES = ['service', 'database', 'messaging', 'external'];

/**
 * The node type in its canonical form: lower case, with a missing type (data from a
 * data-prepper without typed nodes) treated as `service`.
 * @param nodeType - The node's type
 */
export function normalizeNodeType(nodeType: string | undefined): string {
  return (nodeType || '').toLowerCase() || 'service';
}

/**
 * True when the node is an inferred dependency rather than an instrumented service: any
 * type other than `service`, including types this version does not know yet, which get the
 * dependency views with a generic label.
 * @param nodeType - The node's type
 */
export function isDependencyType(nodeType: string | undefined): boolean {
  return normalizeNodeType(nodeType) !== 'service';
}

/**
 * True for the placeholders data-prepper uses for a remote target it could not identify
 * (`UnknownRemoteService` / `unknown`). Only dependency nodes count, so a real service with
 * such a name is still shown.
 */
export function isDependencyPlaceholder(name: string | undefined, nodeType: string | undefined) {
  return isDependencyType(nodeType) && (name === 'UnknownRemoteService' || name === 'unknown');
}

/**
 * True when the node type is a message broker (messaging).
 * @param nodeType - The node's type
 */
export function isMessagingType(nodeType: string | undefined): boolean {
  return (nodeType || '').toLowerCase() === 'messaging';
}

/**
 * Node kind label for the catalog "Type" column: "Database" / "Messaging" /
 * "External" for dependencies, otherwise "Service".
 * @param nodeType - The node's type
 */
export function getNodeTypeLabel(nodeType: string | undefined): string {
  const key = normalizeNodeType(nodeType);
  if (key === 'service') return SERVICE_TYPE_LABEL;
  return NODE_TYPE_LABEL_MAP[key] || OTHER_DEPENDENCY_TYPE_LABEL;
}

/**
 * Resolve the icon key for a service-map node. Non-service dependency nodes
 * (database / messaging / external) map to a dedicated icon; everything else
 * falls back to the environment-derived platform type.
 * @param nodeType - The node's KeyAttributes.Type (service / database / messaging / external)
 * @param environment - Environment string, used for the service fallback
 * @param name - The node's name, which carries a dependency's system (see
 *   getDependencySystemFromName)
 * @returns Icon key understood by getIcon()
 */
export function getNodeIconType(
  nodeType: string | undefined,
  environment: string,
  name?: string
): string {
  const key = (nodeType || '').toLowerCase();
  if (getDependencyIconKey && isDependencyType(key)) {
    return getDependencyIconKey(key, getDependencySystemFromName(key, name));
  }
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
