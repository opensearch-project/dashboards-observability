/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { NotificationsStart } from '../../../../../../../src/core/public';
import { RequirementCallout } from '../components/requirement_callout';
import { DataSourcePicker } from '../components/data_source_picker';
import { createApmServiceMapDataset } from '../utils/apm_auto_create';
import {
  APM_SERVICE_MAP_INDEX_PATTERN,
  APM_SERVICE_MAP_REQUIRED_FIELDS,
  APM_SERVICE_MAP_DOCS_URL,
} from '../../common/constants';
import { ApmDatasetsHook } from '../../shared/hooks/use_apm_config';
import { ApmDetectionHook } from '../hooks/use_apm_detection';
import { useDatasetStep } from '../hooks/use_dataset_step';
import { StepState } from '../types';

export interface ServicesStepProps {
  detection: ApmDetectionHook;
  datasets: ApmDatasetsHook;
  notifications: NotificationsStart;
  state: StepState;
  onStateChange: (state: StepState) => void;
  onServiceMapDatasetIdChange: (id: string) => void;
  selectedDataSourceId: string;
  onSelectedDataSourceIdChange: (id: string) => void;
}

/**
 * Page 3 — Services. Lets the user pick any data source, then for that source
 * either reuses an existing service-map dataset or offers a one-click
 * auto-create of the v2 service-map dataset. Existence and detection are scoped
 * to the selected data source, evaluated independently of the traces page.
 *
 * Service maps aren't identified by name or signal type — the real ones are
 * untyped, but a user may also build one from a logs/traces dataset. There's no
 * reliable type discriminator, so {@link useDatasetStep} is configured with
 * `scope: 'all'` and gates purely on fields: a dataset is usable only if it has
 * the v2 service-map fields. Invalid ones stay selectable so their fields can be
 * refreshed.
 */
export const ServicesStep = ({
  detection,
  datasets,
  notifications,
  state,
  onStateChange,
  onServiceMapDatasetIdChange,
  selectedDataSourceId,
  onSelectedDataSourceIdChange,
}: ServicesStepProps) => {
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
    onDatasetIdChange: onServiceMapDatasetIdChange,
    requiredFields: APM_SERVICE_MAP_REQUIRED_FIELDS,
    scope: 'all',
    createdLabelPrefix: 'Service Map Dataset',
    createDataset: async (savedObjectsClient, dataViews, detected) => {
      const serviceMapId = await createApmServiceMapDataset(
        savedObjectsClient,
        dataViews,
        detected
      );
      return { datasetId: serviceMapId };
    },
    createFailedMessage: i18n.translate('observability.apm.setupWizard.services.createFailed', {
      defaultMessage: 'Could not create the service map dataset.',
    }),
    missingFieldsLabel: i18n.translate(
      'observability.apm.setupWizard.services.missingFieldsLabel',
      { defaultMessage: 'missing required fields' }
    ),
    refreshFieldsErrorTitle: i18n.translate(
      'observability.apm.setupWizard.services.refreshFieldsErrorTitle',
      { defaultMessage: 'Could not refresh dataset fields' }
    ),
    onCreated: () => {
      notifications.toasts.addSuccess({
        title: i18n.translate('observability.apm.setupWizard.services.createdTitle', {
          defaultMessage: 'Service map dataset created',
        }),
      });
    },
  });

  return (
    <div data-test-subj="apmSetupWizardServicesStep">
      <EuiText>
        <h3>
          {i18n.translate('observability.apm.setupWizard.services.heading', {
            defaultMessage: 'Services',
          })}
        </h3>
        <p>
          {i18n.translate('observability.apm.setupWizard.services.description', {
            defaultMessage:
              'The service map dataset powers the topology and service dependency views. APM uses the v2 service-map convention.',
          })}
        </p>
      </EuiText>

      <EuiSpacer size="m" />

      <RequirementCallout
        title={i18n.translate('observability.apm.setupWizard.services.requirementTitle', {
          defaultMessage: 'Service map requirements',
        })}
        requiredFields={APM_SERVICE_MAP_REQUIRED_FIELDS}
        docsUrl={APM_SERVICE_MAP_DOCS_URL}
      />

      <EuiSpacer size="m" />

      {/* Data source picker is always shown; each page chooses independently. */}
      {detection.detections.length > 0 && (
        <DataSourcePicker
          detections={detection.detections}
          selectedDataSourceId={selectedDataSourceId}
          onChange={onSelectedDataSourceIdChange}
          signal="serviceMap"
          isLoading={detection.loading}
        />
      )}

      <EuiSpacer size="m" />

      {isBusy ? (
        <EuiText size="s" color="subdued">
          <EuiLoadingSpinner size="m" />{' '}
          {i18n.translate('observability.apm.setupWizard.services.checking', {
            defaultMessage: 'Checking for service map data…',
          })}
        </EuiText>
      ) : hasExistingHere ? (
        <div
          data-test-subj={
            state.status === 'created'
              ? 'apmSetupWizardServicesCreated'
              : 'apmSetupWizardServicesExists'
          }
        >
          <EuiFormRow
            label={i18n.translate('observability.apm.setupWizard.services.existsSelectLabel', {
              defaultMessage: 'Service map dataset',
            })}
            helpText={
              datasetOptions.length > 1
                ? i18n.translate('observability.apm.setupWizard.services.existsMultipleText', {
                    defaultMessage:
                      'Found {count} service map datasets on this data source. Choose which one APM should use.',
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
              data-test-subj="apmSetupWizardServicesExistingPicker"
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
                  ? i18n.translate('observability.apm.setupWizard.services.createdInline', {
                      defaultMessage: 'Service map dataset created and ready to use.',
                    })
                  : i18n.translate('observability.apm.setupWizard.services.existsInline', {
                      defaultMessage: 'This service map dataset is ready to use.',
                    })}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiText>
        </div>
      ) : isInvalidSelection ? (
        <div data-test-subj="apmSetupWizardServicesInvalid">
          <EuiFormRow
            label={i18n.translate('observability.apm.setupWizard.services.invalidSelectLabel', {
              defaultMessage: 'Service map dataset',
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
              data-test-subj="apmSetupWizardServicesInvalidPicker"
            />
          </EuiFormRow>
          <EuiSpacer size="m" />
          <EuiCallOut
            title={i18n.translate('observability.apm.setupWizard.services.invalidTitle', {
              defaultMessage: 'Selected dataset is missing required service map fields',
            })}
            color="warning"
            iconType="alert"
            size="s"
          >
            <p>
              {i18n.translate('observability.apm.setupWizard.services.invalidText', {
                defaultMessage:
                  'This dataset does not have the required fields ({fields}) yet, so it can’t be used for APM. If you recently added data or created it through the API, its field list may be stale — try refreshing its fields.',
                values: { fields: APM_SERVICE_MAP_REQUIRED_FIELDS.join(', ') },
              })}
            </p>
            <EuiSpacer size="s" />
            <EuiButton
              onClick={handleRefreshFields}
              isLoading={isRefreshingFields}
              isDisabled={isRefreshingFields || !state.existingId}
              iconType="refresh"
              size="s"
              data-test-subj="apmSetupWizardServicesRefreshFields"
            >
              {i18n.translate('observability.apm.setupWizard.services.refreshFieldsButton', {
                defaultMessage: 'Refresh fields',
              })}
            </EuiButton>
          </EuiCallOut>

          {/* If a valid dataset exists, point at it; else offer auto-create when
              raw service-map data is detected on this source. */}
          {hasValidOption ? (
            <>
              <EuiSpacer size="m" />
              <EuiText size="s" color="subdued">
                <p>
                  {i18n.translate('observability.apm.setupWizard.services.invalidPickValidHint', {
                    defaultMessage:
                      'A valid service map dataset is available on this data source — select it from the list above to continue.',
                  })}
                </p>
              </EuiText>
            </>
          ) : (
            selectedDetection?.serviceMapDetected && (
              <>
                <EuiSpacer size="m" />
                <EuiText size="s" color="subdued">
                  <p>
                    {i18n.translate(
                      'observability.apm.setupWizard.services.invalidAutoCreateHint',
                      {
                        defaultMessage:
                          'Or create a new service map dataset from the detected data on this data source:',
                      }
                    )}
                  </p>
                </EuiText>
                <EuiSpacer size="s" />
                <EuiButton
                  fill
                  onClick={handleAutoCreate}
                  isLoading={isCreating}
                  isDisabled={isCreating}
                  data-test-subj="apmSetupWizardServicesInvalidAutoCreate"
                >
                  {i18n.translate('observability.apm.setupWizard.services.autoCreateButton', {
                    defaultMessage: 'Auto-create service map dataset',
                  })}
                </EuiButton>
              </>
            )
          )}
        </div>
      ) : selectedDetection?.serviceMapDetected ? (
        <>
          <EuiCallOut
            title={i18n.translate('observability.apm.setupWizard.services.detectedTitle', {
              defaultMessage: 'Service map data detected',
            })}
            color="primary"
            iconType="search"
            size="s"
          >
            <p>
              {i18n.translate('observability.apm.setupWizard.services.detectedText', {
                defaultMessage:
                  'Found service map data matching {pattern}. Create the dataset to continue.',
                values: { pattern: selectedDetection.serviceMapPattern },
              })}
            </p>
          </EuiCallOut>
          <EuiSpacer size="m" />
          <EuiButton
            fill
            onClick={handleAutoCreate}
            isLoading={isCreating}
            isDisabled={isCreating}
            data-test-subj="apmSetupWizardServicesAutoCreate"
          >
            {i18n.translate('observability.apm.setupWizard.services.autoCreateButton', {
              defaultMessage: 'Auto-create service map dataset',
            })}
          </EuiButton>
          {state.status === 'error' && state.error && (
            <>
              <EuiSpacer size="m" />
              <EuiCallOut
                title={i18n.translate('observability.apm.setupWizard.services.errorTitle', {
                  defaultMessage: 'Failed to create service map dataset',
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
          title={i18n.translate('observability.apm.setupWizard.services.detectionErrorTitle', {
            defaultMessage: 'Could not check for service map data',
          })}
          color="danger"
          iconType="alert"
          size="s"
          data-test-subj="apmSetupWizardServicesDetectionError"
        >
          <p>{detection.error.message}</p>
          <EuiButton
            size="s"
            onClick={detection.refresh}
            data-test-subj="apmSetupWizardServicesDetectionErrorRetry"
          >
            {i18n.translate('observability.apm.setupWizard.services.retryButton', {
              defaultMessage: 'Retry',
            })}
          </EuiButton>
        </EuiCallOut>
      ) : (
        <EuiCallOut
          title={i18n.translate('observability.apm.setupWizard.services.noDataTitle', {
            defaultMessage: 'No service map data found',
          })}
          color="warning"
          iconType="alert"
          size="s"
          data-test-subj="apmSetupWizardServicesNoData"
        >
          <p>
            {i18n.translate('observability.apm.setupWizard.services.noDataText', {
              defaultMessage:
                'No indices matching {pattern} with the required fields were found on this data source. Choose a different data source, or configure a Data Prepper service-map pipeline and refresh.',
              values: { pattern: APM_SERVICE_MAP_INDEX_PATTERN },
            })}
          </p>
          <EuiButton
            size="s"
            onClick={detection.refresh}
            data-test-subj="apmSetupWizardServicesRefresh"
          >
            {i18n.translate('observability.apm.setupWizard.services.refreshButton', {
              defaultMessage: 'Refresh',
            })}
          </EuiButton>
        </EuiCallOut>
      )}
    </div>
  );
};
