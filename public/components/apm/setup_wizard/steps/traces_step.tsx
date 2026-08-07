/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { NotificationsStart } from '../../../../../../../src/core/public';
import { coreRefs } from '../../../../framework/core_refs';
import { useDatasets, useCorrelatedLogs } from '../../shared/hooks/use_apm_config';
import { navigateToDatasetCorrelations } from '../../shared/utils/navigation_utils';
import { RequirementCallout } from '../components/requirement_callout';
import { DataSourcePicker } from '../components/data_source_picker';
import { createApmTraceDatasets, refreshAndPersistFields } from '../utils/apm_auto_create';
import { fieldNamesSatisfy } from '../utils/apm_auto_detect';
import { APM_TRACES_INDEX_PATTERN, APM_TRACES_REQUIRED_FIELDS } from '../constants';
import { APM_TRACES_DOCS_URL, APM_CORRELATIONS_DOCS_URL } from '../../common/constants';
import { ApmDetectionResult, StepState } from '../types';

interface DetectionHook {
  detections: ApmDetectionResult[];
  loading: boolean;
  error?: Error;
  refresh: () => void;
}

export interface TracesStepProps {
  detection: DetectionHook;
  notifications: NotificationsStart;
  state: StepState;
  onStateChange: (state: StepState) => void;
  onTracesDatasetIdChange: (id: string) => void;
  selectedDataSourceId: string;
  onSelectedDataSourceIdChange: (id: string) => void;
}

/**
 * Page 2 — Traces. Lets the user pick any data source, then for that source
 * either reuses an existing traces dataset or offers a one-click auto-create
 * (traces + correlated logs). Existence and detection are scoped to the
 * selected data source, so switching sources re-evaluates independently.
 */
export const TracesStep = ({
  detection,
  notifications,
  state,
  onStateChange,
  onTracesDatasetIdChange,
  selectedDataSourceId,
  onSelectedDataSourceIdChange,
}: TracesStepProps) => {
  const { tracesDatasets, loading: datasetsLoading, refresh: refreshDatasets } = useDatasets();
  const [isCreating, setIsCreating] = useState(false);
  // Id of a dataset we just auto-created. The datasets list refreshes async, so
  // we hold the selection on this id until the list catches up — otherwise the
  // reconcile effect would briefly see it "missing" and clobber the selection
  // back to an invalid dataset.
  const justCreatedIdRef = useRef<string | undefined>(undefined);

  // Detection result for the currently selected data source.
  const selectedDetection = useMemo(
    () => detection.detections.find((d) => (d.dataSourceId || '') === (selectedDataSourceId || '')),
    [detection.detections, selectedDataSourceId]
  );

  const [isRefreshingFields, setIsRefreshingFields] = useState(false);

  const datasetHasRequiredFields = (fieldNames?: string[]) =>
    fieldNamesSatisfy(fieldNames ?? [], APM_TRACES_REQUIRED_FIELDS);

  // All signalType:traces datasets on the selected source — including ones that
  // don't (yet) have the required fields, so the user can select and refresh them.
  const allScopedDatasets = useMemo(
    () =>
      tracesDatasets.filter((d) => (d.value?.datasourceId || '') === (selectedDataSourceId || '')),
    [tracesDatasets, selectedDataSourceId]
  );

  // Of those, the ones that actually meet the field requirements (a DataView can
  // be tagged signalType:traces before its index has the fields).
  const scopedDatasets = useMemo(
    () => allScopedDatasets.filter((d) => datasetHasRequiredFields(d.value?.fieldNames)),
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

    // Reuse a valid traces dataset on this source if one exists.
    if (scopedDatasets.length > 0) {
      const stillValid = scopedDatasets.find((d) => d.value?.id === state.existingId);
      const chosen = stillValid ?? scopedDatasets[0];
      const existingId = chosen.value?.id;
      if (existingId) {
        onTracesDatasetIdChange(existingId);
        onStateChange({ status: 'exists', existingId, detail: chosen.label });
      }
      return;
    }

    // No valid dataset, but there are trace-tagged datasets missing fields:
    // pre-select the first so the user can try refreshing it. Next stays gated.
    if (allScopedDatasets.length > 0) {
      const chosen = allScopedDatasets[0];
      onTracesDatasetIdChange('');
      onStateChange({ status: 'invalid', existingId: chosen.value?.id, detail: chosen.label });
      return;
    }

    // No dataset on this source yet — offer auto-create if the raw data is
    // present, otherwise report it missing. Clear any stale captured id.
    onTracesDatasetIdChange('');
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
      const result = await createApmTraceDatasets(
        savedObjectsClient,
        data.dataViews,
        selectedDetection
      );

      if (result.traceDatasetId) {
        // Label matches the displayName the create util assigns, so the reuse
        // dropdown shows a friendly chip even before the datasets list refresh.
        const createdLabel = `Trace Dataset${
          selectedDetection.dataSourceTitle ? ` - ${selectedDetection.dataSourceTitle}` : ''
        }`;
        // Hold this selection until the datasets list refresh includes it.
        justCreatedIdRef.current = result.traceDatasetId;
        onTracesDatasetIdChange(result.traceDatasetId);
        onStateChange({
          status: 'created',
          existingId: result.traceDatasetId,
          detail: createdLabel,
        });
        // Pull the newly created dataset into the datasets list so the reuse
        // dropdown can display it (selected) once it resolves.
        refreshDatasets();
        notifications.toasts.addSuccess({
          title: i18n.translate('observability.apm.setupWizard.traces.createdTitle', {
            defaultMessage: 'Traces dataset created',
          }),
          text: result.correlationId
            ? i18n.translate('observability.apm.setupWizard.traces.createdWithLogsText', {
                defaultMessage: 'Created the traces dataset and correlated logs.',
              })
            : i18n.translate('observability.apm.setupWizard.traces.createdText', {
                defaultMessage: 'Created the traces dataset.',
              }),
        });
      } else {
        onStateChange({
          status: 'error',
          error: i18n.translate('observability.apm.setupWizard.traces.createFailed', {
            defaultMessage: 'Could not create the traces dataset.',
          }),
        });
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
      onTracesDatasetIdChange(id);
      onStateChange({ status: 'exists', existingId: id, detail: chosen.label });
    } else {
      onTracesDatasetIdChange('');
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
        title: i18n.translate('observability.apm.setupWizard.traces.refreshFieldsErrorTitle', {
          defaultMessage: 'Could not refresh dataset fields',
        }),
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsRefreshingFields(false);
    }
  };

  // Dropdown options. List every trace-tagged dataset on the source — valid ones
  // and ones missing required fields — so the user can select an invalid one and
  // refresh its fields. Invalid options are labeled so the state is clear.
  // Always ensure the current selection is present (e.g. right after auto-create,
  // before the datasets list refresh lands).
  const missingLabel = i18n.translate('observability.apm.setupWizard.traces.missingFieldsLabel', {
    defaultMessage: 'missing required fields',
  });
  const datasetOptions = useMemo(() => {
    // Valid datasets first, then the ones missing required fields.
    const ordered = [...allScopedDatasets].sort((a, b) => {
      const aValid = datasetHasRequiredFields(a.value?.fieldNames) ? 0 : 1;
      const bValid = datasetHasRequiredFields(b.value?.fieldNames) ? 0 : 1;
      return aValid - bValid;
    });
    const options = ordered.map((d) => ({
      label: datasetHasRequiredFields(d.value?.fieldNames)
        ? d.label
        : `${d.label} — ${missingLabel}`,
      value: d.value?.id,
    }));
    if (state.existingId && !options.some((o) => o.value === state.existingId)) {
      options.push({ label: state.detail || state.existingId, value: state.existingId });
    }
    return options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allScopedDatasets, state.existingId, state.detail]);

  // Whether any valid traces dataset exists on this source. When one does, the
  // invalid branch offers "select the valid one" instead of auto-create.
  const hasValidOption = scopedDatasets.length > 0;

  const selectedOptions = datasetOptions.filter((o) => o.value === state.existingId);

  const isBusy = detection.loading || datasetsLoading || state.status === 'checking';
  const hasExistingHere = state.status === 'exists' || state.status === 'created';
  const isInvalidSelection = state.status === 'invalid';

  // Correlated logs for the selected (valid) trace dataset — read-only, mirrors
  // the APM settings modal. The wizard auto-creates these during trace
  // auto-create; this surfaces what exists and links out to manage them.
  const correlatedLogsDatasetId = hasExistingHere ? state.existingId : undefined;
  const { data: correlatedLogs, loading: correlatedLogsLoading } =
    useCorrelatedLogs(correlatedLogsDatasetId);

  return (
    <div data-test-subj="apmSetupWizardTracesStep">
      <EuiText>
        <h3>
          {i18n.translate('observability.apm.setupWizard.traces.heading', {
            defaultMessage: 'Traces',
          })}
        </h3>
        <p>
          {i18n.translate('observability.apm.setupWizard.traces.description', {
            defaultMessage:
              'APM needs a traces dataset built from your OpenTelemetry span data. When correlated logs are present, they are set up in the same step.',
          })}
        </p>
      </EuiText>

      <EuiSpacer size="m" />

      <RequirementCallout
        title={i18n.translate('observability.apm.setupWizard.traces.requirementTitle', {
          defaultMessage: 'Traces requirements',
        })}
        requiredFields={APM_TRACES_REQUIRED_FIELDS}
        docsUrl={APM_TRACES_DOCS_URL}
      />

      <EuiSpacer size="m" />

      {/* Data source picker is always shown; each page chooses independently. */}
      {detection.detections.length > 0 && (
        <DataSourcePicker
          detections={detection.detections}
          selectedDataSourceId={selectedDataSourceId}
          onChange={onSelectedDataSourceIdChange}
          signal="traces"
          isLoading={detection.loading}
        />
      )}

      <EuiSpacer size="m" />

      {isBusy ? (
        <EuiText size="s" color="subdued">
          <EuiLoadingSpinner size="m" />{' '}
          {i18n.translate('observability.apm.setupWizard.traces.checking', {
            defaultMessage: 'Checking for trace data…',
          })}
        </EuiText>
      ) : hasExistingHere ? (
        <div
          data-test-subj={
            state.status === 'created'
              ? 'apmSetupWizardTracesCreated'
              : 'apmSetupWizardTracesExists'
          }
        >
          <EuiFormRow
            label={i18n.translate('observability.apm.setupWizard.traces.existsSelectLabel', {
              defaultMessage: 'Traces dataset',
            })}
            helpText={
              datasetOptions.length > 1
                ? i18n.translate('observability.apm.setupWizard.traces.existsMultipleText', {
                    defaultMessage:
                      'Found {count} traces datasets on this data source. Choose which one APM should use.',
                    values: { count: datasetOptions.length },
                  })
                : undefined
            }
            fullWidth
          >
            <EuiComboBox
              compressed
              fullWidth
              singleSelection={{ asPlainText: true }}
              isClearable={false}
              options={datasetOptions}
              selectedOptions={selectedOptions}
              onChange={(selected) => {
                const id = selected[0]?.value;
                if (id) {
                  handleSelectExisting(id);
                }
              }}
              data-test-subj="apmSetupWizardTracesExistingPicker"
            />
          </EuiFormRow>

          <EuiSpacer size="s" />
          <EuiText size="s" color="success">
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon type="checkInCircleFilled" color="success" />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                {state.status === 'created'
                  ? i18n.translate('observability.apm.setupWizard.traces.createdInline', {
                      defaultMessage: 'Traces dataset created and ready to use.',
                    })
                  : i18n.translate('observability.apm.setupWizard.traces.existsInline', {
                      defaultMessage: 'This traces dataset is ready to use.',
                    })}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiText>

          {/* Correlated logs (read-only) — mirrors the APM settings modal. */}
          {correlatedLogsDatasetId && (
            <>
              <EuiSpacer size="s" />
              <EuiAccordion
                id="apmSetupWizardCorrelatedLogs"
                initialIsOpen={false}
                paddingSize="s"
                buttonContent={
                  <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap={false}>
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs">
                        <strong>
                          {i18n.translate(
                            'observability.apm.setupWizard.traces.correlatedLogsTitle',
                            {
                              defaultMessage: 'Correlated Logs',
                            }
                          )}
                        </strong>
                      </EuiText>
                    </EuiFlexItem>
                    {correlatedLogs.length > 0 && (
                      <EuiFlexItem grow={false}>
                        <EuiBadge color="hollow">{correlatedLogs.length}</EuiBadge>
                      </EuiFlexItem>
                    )}
                    <EuiFlexItem grow={false}>
                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
                      <span onClick={(e) => e.stopPropagation()}>
                        <EuiToolTip
                          content={i18n.translate(
                            'observability.apm.setupWizard.traces.correlatedLogsLearnMore',
                            { defaultMessage: 'Learn more' }
                          )}
                        >
                          <EuiButtonIcon
                            href={APM_CORRELATIONS_DOCS_URL}
                            target="_blank"
                            iconType="questionInCircle"
                            aria-label="Learn more about correlated logs"
                            color="primary"
                            size="xs"
                          />
                        </EuiToolTip>
                      </span>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                }
                extraAction={
                  <EuiButtonEmpty
                    size="xs"
                    onClick={() => navigateToDatasetCorrelations(correlatedLogsDatasetId)}
                  >
                    {correlatedLogs.length === 0
                      ? i18n.translate('observability.apm.setupWizard.traces.viewCorrelatedLogs', {
                          defaultMessage: 'View correlated logs',
                        })
                      : i18n.translate(
                          'observability.apm.setupWizard.traces.updateCorrelatedLogs',
                          {
                            defaultMessage: 'Update correlated logs',
                          }
                        )}
                  </EuiButtonEmpty>
                }
              >
                {correlatedLogsLoading ? (
                  <EuiText size="xs" color="subdued">
                    {i18n.translate('observability.apm.setupWizard.traces.loadingCorrelatedLogs', {
                      defaultMessage: 'Loading correlated logs...',
                    })}
                  </EuiText>
                ) : correlatedLogs.length > 0 ? (
                  <div>
                    <EuiText size="xs" color="subdued">
                      <p>
                        {i18n.translate(
                          'observability.apm.setupWizard.traces.correlatedLogsDescription',
                          {
                            defaultMessage:
                              'The following log datasets are correlated with this trace dataset:',
                          }
                        )}
                      </p>
                    </EuiText>
                    <EuiSpacer size="xs" />
                    {correlatedLogs.map((log) => (
                      <EuiBadge
                        key={log.id}
                        color="default"
                        style={{ marginRight: '4px', marginBottom: '4px' }}
                      >
                        {log.displayName}
                      </EuiBadge>
                    ))}
                  </div>
                ) : (
                  <EuiText size="xs" color="subdued">
                    {i18n.translate('observability.apm.setupWizard.traces.noCorrelatedLogs', {
                      defaultMessage: 'No correlated log datasets found for this trace dataset.',
                    })}
                  </EuiText>
                )}
              </EuiAccordion>
            </>
          )}
        </div>
      ) : isInvalidSelection ? (
        <div data-test-subj="apmSetupWizardTracesInvalid">
          <EuiFormRow
            label={i18n.translate('observability.apm.setupWizard.traces.invalidSelectLabel', {
              defaultMessage: 'Traces dataset',
            })}
            fullWidth
          >
            <EuiComboBox
              compressed
              fullWidth
              singleSelection={{ asPlainText: true }}
              isClearable={false}
              options={datasetOptions}
              selectedOptions={selectedOptions}
              onChange={(selected) => {
                const id = selected[0]?.value;
                if (id) {
                  handleSelectExisting(id);
                }
              }}
              data-test-subj="apmSetupWizardTracesInvalidPicker"
            />
          </EuiFormRow>
          <EuiSpacer size="m" />
          <EuiCallOut
            title={i18n.translate('observability.apm.setupWizard.traces.invalidTitle', {
              defaultMessage: 'Selected dataset is missing required trace fields',
            })}
            color="warning"
            iconType="alert"
            size="s"
          >
            <p>
              {i18n.translate('observability.apm.setupWizard.traces.invalidText', {
                defaultMessage:
                  'This dataset does not have the required fields ({fields}) yet, so it can’t be used for APM. If you recently added data or created it through the API, its field list may be stale — try refreshing its fields.',
                values: { fields: APM_TRACES_REQUIRED_FIELDS.join(', ') },
              })}
            </p>
            <EuiSpacer size="s" />
            <EuiButton
              onClick={handleRefreshFields}
              isLoading={isRefreshingFields}
              isDisabled={isRefreshingFields || !state.existingId}
              iconType="refresh"
              size="s"
              data-test-subj="apmSetupWizardTracesRefreshFields"
            >
              {i18n.translate('observability.apm.setupWizard.traces.refreshFieldsButton', {
                defaultMessage: 'Refresh fields',
              })}
            </EuiButton>
          </EuiCallOut>

          {/* If a valid dataset exists on this source, point the user at it
              rather than offering auto-create. Otherwise, when raw trace data is
              detected, offer to auto-create a fresh valid dataset. */}
          {hasValidOption ? (
            <>
              <EuiSpacer size="m" />
              <EuiText size="s" color="subdued">
                <p>
                  {i18n.translate('observability.apm.setupWizard.traces.invalidPickValidHint', {
                    defaultMessage:
                      'A valid traces dataset is available on this data source — select it from the list above to continue.',
                  })}
                </p>
              </EuiText>
            </>
          ) : (
            selectedDetection?.tracesDetected && (
              <>
                <EuiSpacer size="m" />
                <EuiText size="s" color="subdued">
                  <p>
                    {i18n.translate('observability.apm.setupWizard.traces.invalidAutoCreateHint', {
                      defaultMessage:
                        'Or create a new traces dataset from the detected data on this data source:',
                    })}
                  </p>
                </EuiText>
                <EuiSpacer size="s" />
                <EuiButton
                  fill
                  onClick={handleAutoCreate}
                  isLoading={isCreating}
                  isDisabled={isCreating}
                  data-test-subj="apmSetupWizardTracesInvalidAutoCreate"
                >
                  {i18n.translate('observability.apm.setupWizard.traces.autoCreateButton', {
                    defaultMessage: 'Auto-create traces dataset',
                  })}
                </EuiButton>
              </>
            )
          )}
        </div>
      ) : selectedDetection?.tracesDetected ? (
        <>
          <EuiCallOut
            title={i18n.translate('observability.apm.setupWizard.traces.detectedTitle', {
              defaultMessage: 'Trace data detected',
            })}
            color="primary"
            iconType="search"
            size="s"
          >
            <p>
              {i18n.translate('observability.apm.setupWizard.traces.detectedText', {
                defaultMessage:
                  'Found trace data matching {pattern}{logs}. Create the dataset to continue.',
                values: {
                  pattern: selectedDetection.tracePattern,
                  logs: selectedDetection.logsDetected
                    ? i18n.translate('observability.apm.setupWizard.traces.detectedLogsSuffix', {
                        defaultMessage: ' and correlated logs',
                      })
                    : '',
                },
              })}
            </p>
          </EuiCallOut>
          <EuiSpacer size="m" />
          <EuiButton
            fill
            onClick={handleAutoCreate}
            isLoading={isCreating}
            isDisabled={isCreating}
            data-test-subj="apmSetupWizardTracesAutoCreate"
          >
            {i18n.translate('observability.apm.setupWizard.traces.autoCreateButton', {
              defaultMessage: 'Auto-create traces dataset',
            })}
          </EuiButton>
          {state.status === 'error' && state.error && (
            <>
              <EuiSpacer size="m" />
              <EuiCallOut
                title={i18n.translate('observability.apm.setupWizard.traces.errorTitle', {
                  defaultMessage: 'Failed to create traces dataset',
                })}
                color="danger"
                iconType="alert"
                size="s"
              >
                <p>{state.error}</p>
              </EuiCallOut>
            </>
          )}
        </>
      ) : (
        <EuiCallOut
          title={i18n.translate('observability.apm.setupWizard.traces.noDataTitle', {
            defaultMessage: 'No trace data found',
          })}
          color="warning"
          iconType="alert"
          size="s"
          data-test-subj="apmSetupWizardTracesNoData"
        >
          <p>
            {i18n.translate('observability.apm.setupWizard.traces.noDataText', {
              defaultMessage:
                'No indices matching {pattern} with the required fields were found on this data source. Choose a different data source, or configure a Data Prepper pipeline and refresh.',
              values: { pattern: APM_TRACES_INDEX_PATTERN },
            })}
          </p>
          <EuiButton
            size="s"
            onClick={detection.refresh}
            data-test-subj="apmSetupWizardTracesRefresh"
          >
            {i18n.translate('observability.apm.setupWizard.traces.refreshButton', {
              defaultMessage: 'Refresh',
            })}
          </EuiButton>
        </EuiCallOut>
      )}
    </div>
  );
};
