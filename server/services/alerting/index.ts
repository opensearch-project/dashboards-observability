/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerting services — server-side barrel (routes wiring entry point).
 * Runtime classes and error helpers only. Types live in `common/types/alerting`;
 * framework-agnostic helpers live in `common/services/alerting`.
 *
 * Post-Phase-5 state:
 *   - `MonitorMutationService` — 4 OS write paths (create/update/delete/ack)
 *     used by the mutation routes in `server/routes/alerting/mutations/`.
 *   - `MultiBackendAlertService` — routing layer for the 13 read routes +
 *     1 AM config route, delegates to the two backends below.
 *   - `HttpOpenSearchBackend` — OS reads (monitors, alerts, destinations).
 *   - `DirectQueryPrometheusBackend` — Prom reads (rules, alerts, metadata,
 *     Alertmanager status).
 *   - `PrometheusMetadataService` — metric/label/metric-metadata lookups.
 *   - `InMemoryDatasourceService` was deleted; the client now reads data-
 *     sources from `data-source` + `data-connection` saved objects directly,
 *     and server routes resolve datasources via the saved-object helpers in
 *     `server/routes/alerting/index.ts`.
 */
export { PLUGIN_ID, PLUGIN_NAME } from './constants';

export { MonitorMutationService } from './monitor_mutation_service';
export { MultiBackendAlertService } from './alert_service';
export { HttpOpenSearchBackend } from './opensearch_backend';
export { DirectQueryPrometheusBackend } from './directquery_prometheus_backend';
export { PrometheusMetadataService } from './prometheus_metadata_service';
export { SavedObjectDatasourceService } from './saved_object_datasource_service';

export type {
  AlertManagerError,
  NotFoundError,
  ValidationError,
  InternalError,
  ConflictError,
} from './errors';
export {
  createNotFoundError,
  createValidationError,
  createInternalError,
  createConflictError,
  isAlertManagerError,
  isStatusCode,
  errorToStatus,
} from './errors';
