/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Constants for APM components
 */
export const APM_CONSTANTS = {
  // Filter sidebar
  ATTRIBUTE_VALUES_INITIAL_LIMIT: 5,

  // Table pagination
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100] as const,

  // Sparklines
  SPARKLINE_HEIGHT: 20,
  SPARKLINE_WIDTH: 120,

  // Colors for metrics
  COLORS: {
    LATENCY: '#6092C0',
    THROUGHPUT: '#54B399',
    FAILURE_RATE: '#D36086',
  },
} as const;

/**
 * Maps uppercase platform type to display key for environment filter
 */
export const ENVIRONMENT_PLATFORM_MAP: Record<string, string> = {
  GENERIC: 'generic',
  EKS: 'EKS',
  ECS: 'ECS',
  EC2: 'EC2',
  LAMBDA: 'Lambda',
};

/**
 * Maps raw environment values to display-friendly names
 * Example: "generic:default" → "generic"
 */
export const ENVIRONMENT_DISPLAY_MAP: Record<string, string> = {
  'generic:default': 'generic',
};

/**
 * Get display-friendly environment name
 * @param environment - Raw environment string (e.g., "generic:default", "eks:cluster/namespace")
 * @returns Display-friendly name (e.g., "generic", "eks")
 */
export function getEnvironmentDisplayName(environment: string): string {
  if (!environment) {
    return '';
  }

  // Check if there's a direct mapping
  if (ENVIRONMENT_DISPLAY_MAP[environment]) {
    return ENVIRONMENT_DISPLAY_MAP[environment];
  }

  // Default: return environment prefix (before colon)
  const colonIndex = environment.indexOf(':');
  if (colonIndex > 0) {
    return environment.substring(0, colonIndex);
  }

  return environment;
}
