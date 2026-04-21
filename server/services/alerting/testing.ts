/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test and development exports — mock backends and enrichment helpers.
 * Import from 'common/testing' instead of 'common' to make the dev-only
 * dependency explicit.
 */
export { MockOpenSearchBackend } from './mock_backend';
export { MockPrometheusBackend } from './mock_prometheus_backend';
export {
  generateMockAlertHistory,
  generateMockNotificationRouting,
  generateMockPreviewData,
  generateMockSuppressionRules,
  getAiSummary,
  getDescription,
} from './mock_enrichment';
