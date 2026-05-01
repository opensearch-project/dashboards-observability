/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Types for the Create Logs Monitor flyout. Shared across the flyout shell
 * and every `sections/*` sub-component. Pure TS — no React / JSX imports.
 *
 * Contents:
 *   - `LogsMonitorType` — monitor variant union
 *   - `TriggerState` / `ActionState` — trigger + notification shapes
 *   - `LogsMonitorFormState` — top-level form state owned by the shell
 *   - `CreateLogsMonitorProps` — component props contract
 */

// ============================================================================
// Types
// ============================================================================

export type LogsMonitorType = 'query_level' | 'bucket_level' | 'document_level' | 'cluster_metrics';

export interface TriggerState {
  id: string;
  name: string;
  severityLevel: string;
  type: string;
  conditionOperator: string;
  conditionValue: number;
  suppressEnabled: boolean;
  suppressExpiry: number;
  suppressExpiryUnit: string;
  actions: ActionState[];
}

export interface ActionState {
  id: string;
  name: string;
  notificationChannel: string;
  subject: string;
  message: string;
}

export interface LogsMonitorFormState {
  monitorName: string;
  description: string;
  monitorType: LogsMonitorType;
  selectedDatasource: string;
  query: string;
  frequencyType: string;
  runEveryValue: number;
  runEveryUnit: string;
  triggers: TriggerState[];
  // Cluster metrics specific
  clusterMetricsApi: string;
  // Document level specific
  docLevelTags: string;
  docLevelIndices: string;
  // Bucket level specific
  bucketField: string;
  bucketAggregation: string;
}

export interface CreateLogsMonitorProps {
  onCancel: () => void;
  onSave: (form: LogsMonitorFormState) => void;
}
