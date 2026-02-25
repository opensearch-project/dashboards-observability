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
 * Convert OpenSearch path to Prometheus label format
 * @param path - Dot-notation path (e.g., "telemetry.sdk.language")
 * @returns Prometheus label format (e.g., "telemetry_sdk_language")
 */
export function toPrometheusLabel(path: string): string {
  return path.replace(/\./g, '_');
}
