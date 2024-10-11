/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type TutorialId =
  | 'otelLogs'
  | 'otelMetrics'
  | 'otelTraces'
  | 'nginx'
  | 'java'
  | 'python'
  | 'golang';

export const COMPONENT_MAP: Record<TutorialId, string> = {
  otelLogs: 'otel-index-patterns',
  otelMetrics: 'otel-index-patterns',
  otelTraces: 'otel-index-patterns',
  nginx: 'nginx',
  java: 'java-tutorial',
  python: 'python-tutorial',
  golang: 'golang-tutorial',
};

export const VERSION_MAP: Record<TutorialId, string> = {
  otelLogs: '1.0.0',
  otelMetrics: '1.0.0',
  otelTraces: '1.0.0',
  nginx: '1.0.0',
  java: '1.0.0',
  python: '1.0.0',
  golang: '1.0.0',
};

export const SIGNAL_MAP: Record<TutorialId, string> = {
  otelLogs: 'Logs',
  otelMetrics: 'Metrics',
  otelTraces: 'Traces',
  nginx: '',
  java: '',
  python: '',
  golang: '',
};
