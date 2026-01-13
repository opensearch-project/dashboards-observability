/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

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
