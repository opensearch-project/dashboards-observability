/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Result of probing a single data source for APM data. Superset of the trace
 * detection result used by the explore plugin — extended to also cover the v2
 * service map. Each `*Detected` flag is true only when both the naming
 * convention matched AND the required fields were found.
 */
export interface ApmDetectionResult {
  /** OpenSearch data source id; undefined for the local cluster. */
  dataSourceId?: string;
  /** Human-readable data source title; 'Local Cluster' when none. */
  dataSourceTitle?: string;

  // Traces
  tracesDetected: boolean;
  tracePattern: string | null;
  traceTimeField: string | null;

  // Logs (correlated with traces)
  logsDetected: boolean;
  logPattern: string | null;
  logTimeField: string | null;

  // Service map (v2)
  serviceMapDetected: boolean;
  serviceMapPattern: string | null;
  serviceMapTimeField: string | null;
}

/** The four wizard pages, in order. */
export type WizardStep = 'overview' | 'traces' | 'services' | 'metrics';

/**
 * Lifecycle status of a single wizard step's required object.
 * - `invalid`: the user selected an existing dataset that does not (yet) meet
 *   the field requirements — selectable, but the step is NOT complete.
 */
export type StepStatus =
  'checking' | 'exists' | 'missing' | 'creating' | 'created' | 'invalid' | 'error';

/** Per-step UI state tracked by the wizard modal. */
export interface StepState {
  status: StepStatus;
  /** Saved-object id captured once the object exists or is created. */
  existingId?: string;
  /** Optional human-readable detail (e.g. the resolved title). */
  detail?: string;
  /** Error message when status is 'error'. */
  error?: string;
}
