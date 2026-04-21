/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerting services — Phase 1 exports (Alerts, Rules, Routing)
 */
export { PLUGIN_ID, PLUGIN_NAME } from './constants';

export * from '../../../common/types/alerting/types';
export { InMemoryDatasourceService } from './datasource_service';
export { MultiBackendAlertService } from './alert_service';
export { HttpOpenSearchBackend } from './opensearch_backend';
export { DirectQueryPrometheusBackend } from './directquery_prometheus_backend';
export type { DirectQueryConfig } from './directquery_prometheus_backend';
export {
  parseDuration,
  formatDuration,
  validateMonitorForm,
} from '../../../common/services/alerting/validators';
export type {
  MonitorFormState,
  ValidationResult,
  ThresholdCondition,
  LabelEntry,
  AnnotationEntry,
} from '../../../common/services/alerting/validators';
export { validatePromQL, prettifyPromQL } from '../../../common/services/alerting/promql_validator';
export type {
  PromQLError,
  PromQLValidationResult,
} from '../../../common/services/alerting/promql_validator';
export {
  serializeMonitor,
  serializeMonitors,
  deserializeMonitor,
} from '../../../common/services/alerting/serializer';
export type { MonitorConfig } from '../../../common/services/alerting/serializer';
export {
  matchesSearch,
  matchesFilters,
  sortRules,
  filterAlerts,
  emptyFilters,
} from '../../../common/services/alerting/filter';
export type { FilterState } from '../../../common/services/alerting/filter';

export type { AlertManagerError, NotFoundError, ValidationError, InternalError } from './errors';
export {
  createNotFoundError,
  createValidationError,
  createInternalError,
  isAlertManagerError,
  errorToStatus,
} from './errors';
