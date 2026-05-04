/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create Logs Monitor — flyout form based on the Logs alert spec.
 * Supports four monitor types: Query Level, Bucket Level, Document Level,
 * and Cluster Metrics.
 * Sections: Monitor Details, Monitor Type, Query (PPL / Query Editor), Schedule,
 * Triggers (with threshold visualization), Actions, and a sticky footer.
 *
 * This file is the flyout shell and state owner. Sub-files:
 *   - `create_logs_monitor_types.ts`      — types (LogsMonitorType, form state, props)
 *   - `create_logs_monitor_constants.ts`  — option arrays, defaults, mock data, chart helpers
 *   - `sections/monitor_details.tsx`      — Section 1: Monitor Details
 *   - `sections/monitor_type.tsx`         — Section: Monitor Type Selection
 *   - `sections/query.tsx`                — Section 2: Query (PPL / DSL / cluster-metrics)
 *   - `sections/schedule.tsx`             — Section 3: Schedule
 *   - `sections/trigger_item.tsx`         — Single trigger sub-section
 *   - `sections/triggers.tsx`             — Triggers list + "Add another trigger"
 *
 * Re-exports `LogsMonitorFormState` so existing consumers importing from
 * `'./create_logs_monitor'` continue to work unchanged.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import {
  ActionState,
  CreateLogsMonitorProps,
  LogsMonitorFormState,
  LogsMonitorType,
  TriggerState,
} from './create_logs_monitor_types';
import {
  createDefaultTrigger,
  DEFAULT_ACTION_MESSAGE,
  DEFAULT_QUERIES,
} from './create_logs_monitor_constants';
import { MonitorDetailsSection } from './sections/monitor_details';
import { MonitorTypeSection } from './sections/monitor_type';
import { QuerySection } from './sections/query';
import { ScheduleSection } from './sections/schedule';
import { TriggersSection } from './sections/triggers';

// Re-export the form-state type so existing consumers that import
// `LogsMonitorFormState` from `'./create_logs_monitor'` keep working unchanged.
export type { LogsMonitorFormState, LogsMonitorType } from './create_logs_monitor_types';

// ============================================================================
// Main Component
// ============================================================================

export const CreateLogsMonitor: React.FC<CreateLogsMonitorProps> = ({ onCancel, onSave }) => {
  const [form, setForm] = useState<LogsMonitorFormState>({
    monitorName: '',
    description: '',
    monitorType: 'query_level',
    selectedDatasource: 'OpenSearch',
    query: DEFAULT_QUERIES.query_level,
    frequencyType: 'by_interval',
    runEveryValue: 1,
    runEveryUnit: 'minute(s)',
    triggers: [createDefaultTrigger(0, 'query_level')],
    clusterMetricsApi: '_cluster/health',
    docLevelTags: '',
    docLevelIndices: '',
    bucketField: '',
    bucketAggregation: 'count',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingTypeSwitch, setPendingTypeSwitch] = useState<LogsMonitorType | null>(null);
  const initialFormRef = useRef(form);

  const isDirty =
    form.monitorName !== '' ||
    form.query !== initialFormRef.current.query ||
    form.triggers.length !== initialFormRef.current.triggers.length;

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onCancel();
    }
  }, [isDirty, onCancel]);

  const updateForm = useCallback((patch: Partial<LogsMonitorFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyTypeSwitch = useCallback((type: LogsMonitorType) => {
    setForm((prev) => ({
      ...prev,
      monitorType: type,
      query: DEFAULT_QUERIES[type],
      triggers: [createDefaultTrigger(0, type)],
    }));
    setShowPreview(false);
    setPendingTypeSwitch(null);
  }, []);

  const handleMonitorTypeChange = useCallback(
    (type: LogsMonitorType) => {
      const isModified =
        form.monitorName.trim() !== '' ||
        form.triggers.length !== 1 ||
        form.triggers[0]?.name !== 'Trigger 1' ||
        form.triggers[0]?.actions.length > 0 ||
        form.triggers[0]?.conditionValue !== 5;
      if (isModified) {
        setPendingTypeSwitch(type);
      } else {
        applyTypeSwitch(type);
      }
    },
    [form.monitorName, form.triggers, applyTypeSwitch]
  );

  const updateTrigger = useCallback((id: string, patch: Partial<TriggerState>) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const deleteTrigger = useCallback((id: string) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.filter((t) => t.id !== id),
    }));
  }, []);

  const addTrigger = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      triggers: [...prev.triggers, createDefaultTrigger(prev.triggers.length, prev.monitorType)],
    }));
  }, []);

  const updateAction = useCallback(
    (triggerId: string, actionId: string, patch: Partial<ActionState>) => {
      setForm((prev) => ({
        ...prev,
        triggers: prev.triggers.map((t) =>
          t.id === triggerId
            ? { ...t, actions: t.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) }
            : t
        ),
      }));
    },
    []
  );

  const deleteAction = useCallback((triggerId: string, actionId: string) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.map((t) =>
        t.id === triggerId ? { ...t, actions: t.actions.filter((a) => a.id !== actionId) } : t
      ),
    }));
  }, []);

  const addAction = useCallback((triggerId: string) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.map((t) => {
        if (t.id !== triggerId) return t;
        const name = `action_${t.actions.length + 1}`;
        return {
          ...t,
          actions: [
            ...t.actions,
            {
              id: `action-${Date.now()}-${t.actions.length}`,
              name,
              notificationChannel: 'oncall_slack',
              subject: 'Alert: {{ctx.monitor.name}} - {{ctx.trigger.name}}',
              message: DEFAULT_ACTION_MESSAGE,
            },
          ],
        };
      }),
    }));
  }, []);

  const handleRunPreview = useCallback(() => {
    setShowPreview(true);
  }, []);

  const isValid =
    form.monitorName.trim() !== '' &&
    (form.monitorType === 'cluster_metrics' || form.query.trim() !== '') &&
    form.triggers.length > 0;

  return (
    <EuiFlyout onClose={handleClose} size="l" ownFocus aria-labelledby="createLogsMonitorTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="createLogsMonitorTitle">Create Logs Monitor</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          Log-based alerting monitor
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <MonitorDetailsSection form={form} onUpdate={updateForm} />
        <EuiHorizontalRule margin="l" />
        <MonitorTypeSection monitorType={form.monitorType} onUpdate={handleMonitorTypeChange} />
        <EuiHorizontalRule margin="l" />
        <QuerySection
          form={form}
          onUpdate={updateForm}
          showPreview={showPreview}
          onRunPreview={handleRunPreview}
        />
        <EuiHorizontalRule margin="l" />
        <ScheduleSection form={form} onUpdate={updateForm} />
        <EuiHorizontalRule margin="l" />
        <TriggersSection
          triggers={form.triggers}
          monitorType={form.monitorType}
          onUpdateTrigger={updateTrigger}
          onDeleteTrigger={deleteTrigger}
          onAddTrigger={addTrigger}
          onUpdateAction={updateAction}
          onDeleteAction={deleteAction}
          onAddAction={addAction}
        />
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="flexEnd" responsive={false} gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={handleClose}>Cancel</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill onClick={() => onSave(form)} isDisabled={!isValid}>
              Create
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>

      {showDiscardConfirm && (
        <EuiConfirmModal
          title="Discard unsaved changes?"
          onCancel={() => setShowDiscardConfirm(false)}
          onConfirm={() => {
            setShowDiscardConfirm(false);
            onCancel();
          }}
          cancelButtonText="Keep editing"
          confirmButtonText="Discard"
          buttonColor="danger"
        >
          <p>You have unsaved changes. Discard?</p>
        </EuiConfirmModal>
      )}

      {pendingTypeSwitch !== null && (
        <EuiConfirmModal
          title="Change monitor type?"
          onCancel={() => setPendingTypeSwitch(null)}
          onConfirm={() => applyTypeSwitch(pendingTypeSwitch)}
          cancelButtonText="Cancel"
          confirmButtonText="Confirm"
          buttonColor="danger"
          data-test-subj="confirmTypeSwitchModal"
        >
          <p>Changing monitor type will reset your query and triggers. Continue?</p>
        </EuiConfirmModal>
      )}
    </EuiFlyout>
  );
};
