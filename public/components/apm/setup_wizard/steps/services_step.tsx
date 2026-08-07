/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { coreRefs } from '../../../../framework/core_refs';
import { useDatasets } from '../../shared/hooks/use_apm_config';
import { RequirementCallout } from '../components/requirement_callout';
import { DataSourcePicker } from '../components/data_source_picker';
import { createApmServiceMapDataset, refreshAndPersistFields } from '../utils/apm_auto_create';
import { fieldNamesSatisfy } from '../utils/apm_auto_detect';
import { APM_SERVICE_MAP_INDEX_PATTERN, APM_SERVICE_MAP_REQUIRED_FIELDS } from '../constants';
import { APM_SERVICE_MAP_DOCS_URL } from '../../common/constants';
import { ApmDetectionResult, StepState } from '../types';

interface DetectionHook {
  detections: ApmDetectionResult[];
  loading: boolean;
  error?: Error;
  refresh: () => void;
}

export interface ServicesStepProps {
  detection: DetectionHook;
  notifications: NotificationsStart;
  state: StepState;
  onStateChange: (state: StepState) => void;
  onServiceMapDatasetIdChange: (id: string) => void;
  selectedDataSourceId: string;
  onSelectedDataSourceIdChange: (id: string) => void;
}

// Service maps aren't identified by name or signal type — the real ones are
// untyped, but a user may also build one from a logs/traces dataset. There's no
// reliable type discriminator, so we list ALL datasets on the source and gate
// purely on fields: a dataset is usable only if it has the v2 service-map
// fields. Invalid ones stay selectable so their fields can be refreshed.
const serviceMapHasRequiredFields = (fieldNames?: string[]) =>
  fieldNamesSatisfy(fieldNames ?? [], APM_SERVICE_MAP_REQUIRED_FIELDS);

/**
 * Page 3 — Services. Lets the user pick any data source, then for that source
 * either reuses an existing service-map dataset or offers a one-click
 * auto-create of the v2 service-map dataset. Existence and detection are scoped
 * to the selected data source, evaluated independently of the traces page.
 */
export const ServicesStep = ({
  detection,
  notifications,
  state,
  onStateChange,
  onServiceMapDatasetIdChange,
  selectedDataSourceId,
  onSelectedDataSourceIdChange,
}: ServicesStepProps) => {
  const { allDatasets, loading: datasetsLoading, refresh: refreshDatasets } = useDatasets();
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshingFields, setIsRefreshingFields] = useState(false);
  // Id of a dataset we just auto-created; held until the datasets list catches
  // up so the reconcile effect can't clobber the fresh selection.
  const justCreatedIdRef = useRef<string | undefined>(undefined);

  const selectedDetection = useMemo(
    () => detection.detections.find((d) => (d.dataSourceId || '') === (selectedDataSourceId || '')),
    [detection.detections, selectedDataSourceId]
  );

  // All datasets on the selected source — any type. We can't identify service
  // maps by name/type, so validity is decided by fields below; invalid ones
  // stay selectable so the user can refresh their fields.
  const allScopedServiceMaps = useMemo(
    () =>
      allDatasets.filter(
        (option) => (option.value?.datasourceId || '') === (selectedDataSourceId || '')
      ),
    [allDatasets, selectedDataSourceId]
  );

  // Of those, the ones that actually meet the v2 field requirements.
  const scopedServiceMaps = useMemo(
    () => allScopedServiceMaps.filter((d) => serviceMapHasRequiredFields(d.value?.fieldNames)),
    [allScopedServiceMaps]
  );

  useEffect(() => {
    if (detection.loading || datasetsLoading || isCreating || isRefreshingFields) {
      return;
    }

    // Hold the "created" state for a just-created dataset until the datasets
    // list catches up (or if it's already present as a valid dataset).
    if (state.status === 'created') {
      const inList = scopedServiceMaps.some((d) => d.value?.id === state.existingId);
      if (inList) {
        justCreatedIdRef.current = undefined;
        return;
      }
      if (justCreatedIdRef.current && justCreatedIdRef.current === state.existingId) {
        return;
      }
    }

    // If the user selected an invalid dataset on this source, keep it selected
    // (so they can refresh its fields) unless it has since become valid.
    if (state.status === 'invalid') {
      const stillPresent = allScopedServiceMaps.find((d) => d.value?.id === state.existingId);
      const nowValid = scopedServiceMaps.find((d) => d.value?.id === state.existingId);
      if (nowValid) {
        onStateChange({ status: 'exists', existingId: nowValid.value!.id, detail: nowValid.label });
      } else if (stillPresent) {
        return; // still invalid, still on this source — leave as-is
      }
      // else: selection no longer on this source — fall through to re-pick
    }

    // Reuse a valid service-map dataset on this source if one exists.
    if (scopedServiceMaps.length > 0) {
      const stillValid = scopedServiceMaps.find((d) => d.value?.id === state.existingId);
      const chosen = stillValid ?? scopedServiceMaps[0];
      const existingId = chosen.value?.id;
      if (existingId) {
        onServiceMapDatasetIdChange(existingId);
        onStateChange({ status: 'exists', existingId, detail: chosen.label });
      }
      return;
    }

    // No valid dataset, but there are service-map-named datasets missing fields:
    // pre-select the first so the user can try refreshing it. Next stays gated.
    if (allScopedServiceMaps.length > 0) {
      const chosen = allScopedServiceMaps[0];
      onServiceMapDatasetIdChange('');
      onStateChange({ status: 'invalid', existingId: chosen.value?.id, detail: chosen.label });
      return;
    }

    // No dataset on this source yet. Clear any stale id and report missing.
    onServiceMapDatasetIdChange('');
    onStateChange({ status: 'missing' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    detection.loading,
    datasetsLoading,
    isCreating,
    isRefreshingFields,
    allScopedServiceMaps,
    scopedServiceMaps,
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
      const serviceMapId = await createApmServiceMapDataset(
        savedObjectsClient,
        data.dataViews,
        selectedDetection
      );

      if (serviceMapId) {
        // Label matches the displayName the create util assigns, so the reuse
        // dropdown shows a friendly chip even before the datasets list refresh.
        const createdLabel = `Service Map Dataset${
          selectedDetection.dataSourceTitle ? ` - ${selectedDetection.dataSourceTitle}` : ''
        }`;
        // Hold this selection until the datasets list refresh includes it.
        justCreatedIdRef.current = serviceMapId;
        onServiceMapDatasetIdChange(serviceMapId);
        onStateChange({
          status: 'created',
          existingId: serviceMapId,
          detail: createdLabel,
        });
        // Pull the newly created dataset into the datasets list so the reuse
        // dropdown can display it (selected) once it resolves.
        refreshDatasets();
        notifications.toasts.addSuccess({
          title: i18n.translate('observability.apm.setupWizard.services.createdTitle', {
            defaultMessage: 'Service map dataset created',
          }),
        });
      } else {
        onStateChange({
          status: 'error',
          error: i18n.translate('observability.apm.setupWizard.services.createFailed', {
            defaultMessage: 'Could not create the service map dataset.',
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

  // Selecting a dataset on this source. Valid → 'exists' (unlocks Next);
  // invalid → 'invalid' (selectable, Next gated, "Refresh fields" appears).
  const handleSelectExisting = (id: string) => {
    const chosen = allScopedServiceMaps.find((d) => d.value?.id === id);
    if (chosen && serviceMapHasRequiredFields(chosen.value?.fieldNames)) {
      onServiceMapDatasetIdChange(id);
      onStateChange({ status: 'exists', existingId: id, detail: chosen.label });
    } else {
      onServiceMapDatasetIdChange('');
      onStateChange({ status: 'invalid', existingId: id, detail: chosen?.label ?? state.detail });
    }
  };

  // Re-pull the selected DataView's field list and persist it, in case the index
  // gained the required fields after the DataView was created.
  const handleRefreshFields = async () => {
    const data = coreRefs.data;
    if (!data || !state.existingId) return;
    setIsRefreshingFields(true);
    try {
      await refreshAndPersistFields(data.dataViews, state.existingId, true);
      refreshDatasets();
    } catch (error) {
      notifications.toasts.addWarning({
        title: i18n.translate('observability.apm.setupWizard.services.refreshFieldsErrorTitle', {
          defaultMessage: 'Could not refresh dataset fields',
        }),
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsRefreshingFields(false);
    }
  };

  // Dropdown options: all candidates, valid first, invalid ones labeled. Always
  // ensure the current selection is present (e.g. right after auto-create).
  const missingLabel = i18n.translate('observability.apm.setupWizard.services.missingFieldsLabel', {
    defaultMessage: 'missing required fields',
  });
  const datasetOptions = useMemo(() => {
    const ordered = [...allScopedServiceMaps].sort((a, b) => {
      const aValid = serviceMapHasRequiredFields(a.value?.fieldNames) ? 0 : 1;
      const bValid = serviceMapHasRequiredFields(b.value?.fieldNames) ? 0 : 1;
      return aValid - bValid;
    });
    const options = ordered.map((d) => ({
      label: serviceMapHasRequiredFields(d.value?.fieldNames)
        ? d.label
        : `${d.label} — ${missingLabel}`,
      value: d.value?.id,
    }));
    if (state.existingId && !options.some((o) => o.value === state.existingId)) {
      options.push({ label: state.detail || state.existingId, value: state.existingId });
    }
    return options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allScopedServiceMaps, state.existingId, state.detail]);

  const selectedOptions = datasetOptions.filter((o) => o.value === state.existingId);

  const hasValidOption = scopedServiceMaps.length > 0;
  const isBusy = detection.loading || datasetsLoading || state.status === 'checking';
  const hasExistingHere = state.status === 'exists' || state.status === 'created';
  const isInvalidSelection = state.status === 'invalid';

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
