/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Severity-related helpers used by the Monitor Template Wizard. The sort
 * order below is the canonical critical-first ordering the wizard uses when
 * rendering and grouping generated monitors by severity.
 */

// ============================================================================
// Severity helpers
// ============================================================================

export const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
