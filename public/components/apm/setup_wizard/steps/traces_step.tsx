/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
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
import { useCorrelatedLogs } from '../../shared/hooks/use_apm_config';
import { navigateToDatasetCorrelations } from '../../shared/utils/navigation_utils';
import { RequirementCallout } from '../components/requirement_callout';
import { DataSourcePicker } from '../components/data_source_picker';
import { createApmTraceDatasets } from '../utils/apm_auto_create';
import {
  APM_TRACES_INDEX_PATTERN,
  APM_TRACES_REQUIRED_FIELDS,
  APM_TRACES_DOCS_URL,
  APM_CORRELATIONS_DOCS_URL,
} from '../../common/constants';
import { ApmDatasetsHook } from '../../shared/hooks/use_apm_config';
import { ApmDetectionHook } from '../hooks/use_apm_detection';
import { useDatasetStep } from '../hooks/use_dataset_step';
import { StepState } from '../types';

export interface TracesStepProps {
  detection: ApmDetectionHook;
  datasets: ApmDatasetsHook;
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
 * (traces + correlated logs). Existence and detection are scoped to the selected
 * data source, so switching sources re-evaluates independently. Create/reuse/
 * reconcile logic lives in {@link useDatasetStep}.
 */
export const TracesStep = ({
  detection,
  datasets,
  notifications,
  state,
  onStateChange,
  onTracesDatasetIdChange,
  selectedDataSourceId,
  onSelectedDataSourceIdChange,
}: TracesStepProps) => {
  const {
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
  } = useDatasetStep({
    detection,
    datasets,
    selectedDataSourceId,
    notifications,
    state,
    onStateChange,
    onDatasetIdChange: onTracesDatasetIdChange,
    requiredFields: APM_TRACES_REQUIRED_FIELDS,
    scope: 'traces',
    createdLabelPrefix: 'Trace Dataset',
    createDataset: async (savedObjectsClient, dataViews, detected) => {
      const result = await createApmTraceDatasets(savedObjectsClient, dataViews, detected);
      return {
        datasetId: result.traceDatasetId,
        correlationId: result.correlationId,
        correlatedLogsFailed: result.correlatedLogsFailed,
      };
    },
    createFailedMessage: i18n.translate('observability.apm.setupWizard.traces.createFailed', {
      defaultMessage: 'Could not create the traces dataset.',
    }),
    missingFieldsLabel: i18n.translate('observability.apm.setupWizard.traces.missingFieldsLabel', {
      defaultMessage: 'missing required fields',
    }),
    refreshFieldsErrorTitle: i18n.translate(
      'observability.apm.setupWizard.traces.refreshFieldsErrorTitle',
      { defaultMessage: 'Could not refresh dataset fields' }
    ),
    onCreated: (outcome) => {
      notifications.toasts.addSuccess({
        title: i18n.translate('observability.apm.setupWizard.traces.createdTitle', {
          defaultMessage: 'Traces dataset created',
        }),
        text: outcome.correlationId
          ? i18n.translate('observability.apm.setupWizard.traces.createdWithLogsText', {
              defaultMessage: 'Created the traces dataset and correlated logs.',
            })
          : i18n.translate('observability.apm.setupWizard.traces.createdText', {
              defaultMessage: 'Created the traces dataset.',
            }),
      });
      // Correlated logs were detected but their setup failed — trace creation
      // still succeeded, so warn non-blockingly rather than reporting a clean
      // success the user can't tell was partial.
      if (outcome.correlatedLogsFailed) {
        notifications.toasts.addWarning({
          title: i18n.translate('observability.apm.setupWizard.traces.correlatedLogsFailedTitle', {
            defaultMessage: 'Correlated logs were not set up',
          }),
          text: i18n.translate('observability.apm.setupWizard.traces.correlatedLogsFailedText', {
            defaultMessage:
              'The traces dataset was created, but the correlated log dataset or its correlation could not be created. You can set up correlated logs later from the datasets page.',
          }),
        });
      }
    },
  });

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
      ) : detection.error ? (
        <EuiCallOut
          title={i18n.translate('observability.apm.setupWizard.traces.detectionErrorTitle', {
            defaultMessage: 'Could not check for trace data',
          })}
          color="danger"
          iconType="alert"
          size="s"
          data-test-subj="apmSetupWizardTracesDetectionError"
        >
          <p>{detection.error.message}</p>
          <EuiButton
            size="s"
            onClick={detection.refresh}
            data-test-subj="apmSetupWizardTracesDetectionErrorRetry"
          >
            {i18n.translate('observability.apm.setupWizard.traces.retryButton', {
              defaultMessage: 'Retry',
            })}
          </EuiButton>
        </EuiCallOut>
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
