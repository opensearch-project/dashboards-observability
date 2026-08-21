/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { EuiComboBoxOptionOption } from '@elastic/eui';
import { NotificationsStart } from '../../../../../../../src/core/public';
import { DataViewsContract } from '../../../../../../../src/plugins/data/public';
import { coreRefs } from '../../../../framework/core_refs';
import { ApmDatasetsHook } from '../../shared/hooks/use_apm_config';
import { refreshAndPersistFields } from '../utils/apm_auto_create';
import { fieldNamesSatisfy } from '../utils/apm_auto_detect';
import { ApmDetectionResult, StepState } from '../types';
import { ApmDetectionHook } from './use_apm_detection';

/**
 * Shape of a dataset option produced by {@link useDatasets}. Both wizard steps
 * scope these by the selected data source and gate on field membership.
 */
type DatasetOption = EuiComboBoxOptionOption<{
  id: string;
  displayName?: string;
  title: string;
  datasourceId?: string;
  fieldNames?: string[];
}>;

/**
 * Outcome of a step's create action. `datasetId` is the created/reused id (null
 * on failure); steps may carry extra fields (e.g. correlationId, partial-failure
 * warnings) which they read in their own success/warning toast.
 */
export interface DatasetCreateOutcome {
  datasetId: string | null;
}

export interface UseDatasetStepParams<TOutcome extends DatasetCreateOutcome> {
  detection: ApmDetectionHook;
  /** Shared datasets hook, loaded once by the wizard and passed to each step. */
  datasets: ApmDatasetsHook;
  selectedDataSourceId: string;
  notifications: NotificationsStart;
  state: StepState;
  onStateChange: (state: StepState) => void;
  onDatasetIdChange: (id: string) => void;
  /** Fields a dataset must expose to be usable for this signal. */
  requiredFields: readonly string[];
  /**
   * Which datasets list to scope from: `traces` restricts to signalType:traces
   * DataViews; `all` considers every DataView (service maps have no reliable
   * type discriminator, so validity is decided by fields alone).
   */
  scope: 'traces' | 'all';
  /** Prefix for the optimistic chip label, e.g. `Trace Dataset`. */
  createdLabelPrefix: string;
  /** Create-or-reuse the dataset for the selected detection. */
  createDataset: (
    savedObjectsClient: NonNullable<typeof coreRefs.savedObjectsClient>,
    dataViews: DataViewsContract,
    detection: ApmDetectionResult
  ) => Promise<TOutcome>;
  /** Message shown (status: error) when the create returns no id. */
  createFailedMessage: string;
  /** Label appended to datasets missing required fields in the picker. */
  missingFieldsLabel: string;
  /** Toast title used when "Refresh fields" fails. */
  refreshFieldsErrorTitle: string;
  /** Fired after a successful create so the step can show its own toast. */
  onCreated?: (outcome: TOutcome) => void;
}

export interface UseDatasetStepResult {
  selectedDetection?: ApmDetectionResult;
  datasetOptions: Array<{ label: string; value?: string }>;
  selectedOptions: Array<{ label: string; value?: string }>;
  /** Any valid dataset for this signal exists on the selected source. */
  hasValidOption: boolean;
  isBusy: boolean;
  hasExistingHere: boolean;
  isInvalidSelection: boolean;
  isCreating: boolean;
  isRefreshingFields: boolean;
  handleSelectExisting: (id: string) => void;
  handleRefreshFields: () => Promise<void>;
  handleAutoCreate: () => Promise<void>;
}

/**
 * Shared create/reuse/reconcile logic for the traces and services steps: owns
 * the reconcile effect, the just-created selection race, the dropdown options,
 * and the select / refresh-fields / auto-create handlers. Callers pass the
 * signal-specific config (required fields, dataset scope, create fn, labels).
 */
export function useDatasetStep<TOutcome extends DatasetCreateOutcome>({
  detection,
  datasets,
  selectedDataSourceId,
  notifications,
  state,
  onStateChange,
  onDatasetIdChange,
  requiredFields,
  scope,
  createdLabelPrefix,
  createDataset,
  createFailedMessage,
  missingFieldsLabel,
  refreshFieldsErrorTitle,
  onCreated,
}: UseDatasetStepParams<TOutcome>): UseDatasetStepResult {
  const {
    tracesDatasets,
    allDatasets,
    loading: datasetsLoading,
    refresh: refreshDatasets,
  } = datasets;
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshingFields, setIsRefreshingFields] = useState(false);
  // Id of a dataset we just auto-created. The datasets list refreshes async, so
  // we hold the selection on this id until the list catches up — otherwise the
  // reconcile effect would briefly see it "missing" and clobber the selection.
  const justCreatedIdRef = useRef<string | undefined>(undefined);

  const datasetHasRequiredFields = (fieldNames?: string[]) =>
    fieldNamesSatisfy(fieldNames ?? [], requiredFields);

  // Detection result for the currently selected data source.
  const selectedDetection = useMemo(
    () => detection.detections.find((d) => (d.dataSourceId || '') === (selectedDataSourceId || '')),
    [detection.detections, selectedDataSourceId]
  );

  const sourceList: DatasetOption[] = scope === 'traces' ? tracesDatasets : allDatasets;

  // All candidate datasets on the selected source — including ones missing the
  // required fields, so the user can select and refresh them.
  const allScopedDatasets = useMemo(
    () => sourceList.filter((d) => (d.value?.datasourceId || '') === (selectedDataSourceId || '')),
    [sourceList, selectedDataSourceId]
  );

  // Of those, the ones that actually meet the field requirements.
  const scopedDatasets = useMemo(
    () => allScopedDatasets.filter((d) => datasetHasRequiredFields(d.value?.fieldNames)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allScopedDatasets]
  );

  // Reconcile step status whenever inputs (or the selected source) settle.
  useEffect(() => {
    if (detection.loading || datasetsLoading || isCreating || isRefreshingFields) {
      return;
    }

    // Hold the "created" state for a just-created dataset until the datasets
    // list catches up (or if it's already present as a valid dataset). Without
    // this, the async list refresh lets the effect briefly clobber the fresh
    // selection back to an invalid one.
    if (state.status === 'created') {
      const inList = scopedDatasets.some((d) => d.value?.id === state.existingId);
      if (inList) {
        justCreatedIdRef.current = undefined; // list caught up; stop holding
        return;
      }
      if (justCreatedIdRef.current && justCreatedIdRef.current === state.existingId) {
        return; // still waiting for the list refresh — keep the created selection
      }
    }

    // If the user has selected an invalid dataset on this source, keep it
    // selected (so they can refresh its fields) unless it has since become valid.
    if (state.status === 'invalid') {
      const stillPresent = allScopedDatasets.find((d) => d.value?.id === state.existingId);
      const nowValid = scopedDatasets.find((d) => d.value?.id === state.existingId);
      if (nowValid) {
        onStateChange({ status: 'exists', existingId: nowValid.value!.id, detail: nowValid.label });
      } else if (stillPresent) {
        return; // still invalid, still on this source — leave selection as-is
      }
      // else: selection no longer on this source — fall through to re-pick
    }

    // Reuse a valid dataset on this source if one exists.
    if (scopedDatasets.length > 0) {
      const stillValid = scopedDatasets.find((d) => d.value?.id === state.existingId);
      const chosen = stillValid ?? scopedDatasets[0];
      const existingId = chosen.value?.id;
      if (existingId) {
        onDatasetIdChange(existingId);
        onStateChange({ status: 'exists', existingId, detail: chosen.label });
      }
      return;
    }

    // No valid dataset, but there are tagged datasets missing fields: pre-select
    // the first so the user can try refreshing it. Next stays gated.
    if (allScopedDatasets.length > 0) {
      const chosen = allScopedDatasets[0];
      onDatasetIdChange('');
      onStateChange({ status: 'invalid', existingId: chosen.value?.id, detail: chosen.label });
      return;
    }

    // No dataset on this source yet — report missing (steps offer auto-create
    // from the detection result). Clear any stale captured id.
    onDatasetIdChange('');
    onStateChange({ status: 'missing' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    detection.loading,
    datasetsLoading,
    isCreating,
    isRefreshingFields,
    allScopedDatasets,
    scopedDatasets,
    selectedDataSourceId,
  ]);

  const handleAutoCreate = async () => {
    if (!selectedDetection) return;
    const data = coreRefs.data;
    const savedObjectsClient = coreRefs.savedObjectsClient;
    if (!data || !savedObjectsClient) return;

    setIsCreating(true);
    onStateChange({ status: 'creating' });
    try {
      const outcome = await createDataset(savedObjectsClient, data.dataViews, selectedDetection);

      if (outcome.datasetId) {
        // Label matches the displayName the create util assigns, so the reuse
        // dropdown shows a friendly chip even before the datasets list refresh.
        const createdLabel = `${createdLabelPrefix}${
          selectedDetection.dataSourceTitle ? ` - ${selectedDetection.dataSourceTitle}` : ''
        }`;
        // Hold this selection until the datasets list refresh includes it.
        justCreatedIdRef.current = outcome.datasetId;
        onDatasetIdChange(outcome.datasetId);
        onStateChange({ status: 'created', existingId: outcome.datasetId, detail: createdLabel });
        // Pull the newly created dataset into the datasets list so the reuse
        // dropdown can display it (selected) once it resolves.
        refreshDatasets();
        onCreated?.(outcome);
      } else {
        onStateChange({ status: 'error', error: createFailedMessage });
      }
    } catch (error) {
      onStateChange({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Selecting a dataset on this source. Valid datasets → 'exists' (captures the
  // id, unlocks Next); invalid ones → 'invalid' (selectable, but Next stays
  // gated and a "Refresh fields" affordance appears).
  const handleSelectExisting = (id: string) => {
    const chosen = allScopedDatasets.find((d) => d.value?.id === id);
    if (chosen && datasetHasRequiredFields(chosen.value?.fieldNames)) {
      onDatasetIdChange(id);
      onStateChange({ status: 'exists', existingId: id, detail: chosen.label });
    } else {
      onDatasetIdChange('');
      onStateChange({ status: 'invalid', existingId: id, detail: chosen?.label ?? state.detail });
    }
  };

  // Re-pull the selected DataView's field list from the cluster and persist it,
  // in case the index gained the required fields after the DataView was created.
  const handleRefreshFields = async () => {
    const data = coreRefs.data;
    if (!data || !state.existingId) return;
    setIsRefreshingFields(true);
    try {
      // Shared with create/reuse; throwOnError so we can surface a toast.
      await refreshAndPersistFields(data.dataViews, state.existingId, true);
      // Re-read datasets; the reconcile effect promotes the selection to
      // 'exists' if the refresh brought in the required fields.
      refreshDatasets();
    } catch (error) {
      notifications.toasts.addWarning({
        title: refreshFieldsErrorTitle,
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsRefreshingFields(false);
    }
  };

  // Dropdown options. List every candidate on the source — valid ones and ones
  // missing required fields — so the user can select an invalid one and refresh
  // its fields. Invalid options are labeled. Always ensure the current selection
  // is present (e.g. right after auto-create, before the datasets list refresh).
  const datasetOptions = useMemo(() => {
    const ordered = [...allScopedDatasets].sort((a, b) => {
      const aValid = datasetHasRequiredFields(a.value?.fieldNames) ? 0 : 1;
      const bValid = datasetHasRequiredFields(b.value?.fieldNames) ? 0 : 1;
      return aValid - bValid;
    });
    const options = ordered.map((d) => ({
      label: datasetHasRequiredFields(d.value?.fieldNames)
        ? d.label
        : `${d.label} — ${missingFieldsLabel}`,
      value: d.value?.id,
    }));
    if (state.existingId && !options.some((o) => o.value === state.existingId)) {
      options.push({ label: state.detail || state.existingId, value: state.existingId });
    }
    return options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allScopedDatasets, state.existingId, state.detail]);

  const selectedOptions = datasetOptions.filter((o) => o.value === state.existingId);

  const hasValidOption = scopedDatasets.length > 0;
  const isBusy = detection.loading || datasetsLoading || state.status === 'checking';
  const hasExistingHere = state.status === 'exists' || state.status === 'created';
  const isInvalidSelection = state.status === 'invalid';

  return {
    selectedDetection,
    datasetOptions,
    selectedOptions,
    hasValidOption,
    isBusy,
    hasExistingHere,
    isInvalidSelection,
    isCreating,
    isRefreshingFields,
    handleSelectExisting,
    handleRefreshFields,
    handleAutoCreate,
  };
}
