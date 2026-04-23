/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerting services — server-side barrel (routes wiring entry point).
 * Runtime classes and error helpers only. Types live in `common/types/alerting`;
 * framework-agnostic helpers live in `common/services/alerting`.
 */
export { PLUGIN_ID, PLUGIN_NAME } from './constants';

export { InMemoryDatasourceService } from './datasource_service';
export { MultiBackendAlertService } from './alert_service';
export { HttpOpenSearchBackend } from './opensearch_backend';
export { DirectQueryPrometheusBackend } from './directquery_prometheus_backend';
export type { DirectQueryConfig } from './directquery_prometheus_backend';

export type { AlertManagerError, NotFoundError, ValidationError, InternalError } from './errors';
export {
  createNotFoundError,
  createValidationError,
  createInternalError,
  isAlertManagerError,
  errorToStatus,
} from './errors';
