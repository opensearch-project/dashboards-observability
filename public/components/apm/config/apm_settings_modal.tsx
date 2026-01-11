/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  EuiOverlayMask,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiButton,
  EuiButtonEmpty,
  EuiSpacer,
  EuiForm,
  EuiFormRow,
  EuiComboBox,
  EuiText,
  EuiAccordion,
  EuiButtonIcon,
  EuiBadge,
  EuiCallOut,
} from '@elastic/eui';
<<<<<<< HEAD
import { i18n } from '@osd/i18n';
=======
>>>>>>> b9ca851c (Add APM config and provider)
import { NotificationsStart, CoreStart } from '../../../../../../src/core/public';
import { getWorkspaceIdFromUrl } from '../../../../../../src/core/public/utils';
import { useDatasets, usePrometheusDataSources, useCorrelatedLogs } from './hooks';
import { useApmConfig } from './apm_config_context';
import { OSDSavedApmConfigClient } from '../../../services/saved_objects/saved_object_client/osd_saved_objects/apm_config';
import { ApmArchitectureSvgLight, ApmArchitectureSvgDark } from './apm-architecture-svg';
import { AppPluginStartDependencies } from '../../../types';

/**
 * Type guard to safely check if an unknown value is an Error
 */
function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export interface ApmSettingsModalProps {
  onClose: (saved?: boolean) => void;
  notifications: NotificationsStart;
  CoreStartProp: CoreStart;
  DepsStart: AppPluginStartDependencies;
}

export const ApmSettingsModal = (props: ApmSettingsModalProps) => {
  const { onClose, notifications, CoreStartProp, DepsStart } = props;

  // Get data service for dataset queries from DepsStart (plugin dependencies)
  const dataService = DepsStart?.data;
  const savedObjectsClient = CoreStartProp?.savedObjects?.client;

  // Get current workspace ID from URL
  const workspaceId = getWorkspaceIdFromUrl(
    window.location.href,
    CoreStartProp?.http?.basePath?.serverBasePath || ''
  );

  // Form state - minimal fields only
  const [formData, setFormData] = useState({
    tracesDatasetId: '',
    serviceMapDatasetId: '',
    prometheusDataSourceId: '',
  });

  const [selectedTracesDataset, setSelectedTracesDataset] = useState([]);
  const [selectedServiceMapDataset, setSelectedServiceMapDataset] = useState([]);
  const [selectedPrometheusDS, setSelectedPrometheusDS] = useState([]);

  // Form validation state
  const [showErrors, setShowErrors] = useState(false);
  const [errors, setErrors] = useState({
    tracesDataset: [] as string[],
    serviceMapDataset: [] as string[],
    prometheusDataSource: [] as string[],
  });

  // Get config from context (already fetched by ApmConfigProvider)
  const { config: existingConfig } = useApmConfig();
  const [isSaving, setIsSaving] = useState(false);

  // Theme detection
  const [isDarkMode] = useState(() => {
    const theme = CoreStartProp?.uiSettings?.get('theme:darkMode');
    return theme === true || theme === 'true';
  });

  // Data loading hooks - combined datasets hook for efficiency
  const {
    tracesDatasets,
    allDatasets,
    loading: datasetsLoading,
    error: datasetsError,
    refresh: refreshDatasets,
  } = useDatasets(dataService);

  const {
    data: prometheusDataSources,
    loading: prometheusLoading,
    error: prometheusError,
    refresh: refreshPrometheus,
  } = usePrometheusDataSources(dataService);

  // Load correlated log datasets for the selected trace dataset
  const {
    data: correlatedLogs,
    loading: correlatedLogsLoading,
    error: correlatedLogsError,
  } = useCorrelatedLogs(dataService, savedObjectsClient, formData.tracesDatasetId);

  // Populate form when existing config is available from context
  useEffect(() => {
    if (existingConfig) {
      // Validate all required references exist
      const hasAllReferences =
        existingConfig.tracesDataset?.id &&
        existingConfig.serviceMapDataset?.id &&
        existingConfig.prometheusDataSource?.id;

      if (!hasAllReferences) {
        notifications.toasts.addWarning({
          title: 'Configuration could not be loaded',
          text: 'Some referenced data sources are missing or unavailable. Please reconfigure.',
        });
        return;
      }

      // Populate form data
      setFormData({
        tracesDatasetId: existingConfig.tracesDataset.id,
        serviceMapDatasetId: existingConfig.serviceMapDataset.id,
        prometheusDataSourceId: existingConfig.prometheusDataSource.id,
      });

      // Set selected options
      const tracesLabel = existingConfig.tracesDataset.name || existingConfig.tracesDataset.title;
      const serviceMapLabel =
        existingConfig.serviceMapDataset.name || existingConfig.serviceMapDataset.title;
      setSelectedTracesDataset([
        {
          label: tracesLabel,
          value: {
            id: existingConfig.tracesDataset.id,
            title: existingConfig.tracesDataset.title,
          },
        },
      ]);
      setSelectedServiceMapDataset([
        {
          label: serviceMapLabel,
          value: {
            id: existingConfig.serviceMapDataset.id,
            title: existingConfig.serviceMapDataset.title,
          },
        },
      ]);
      setSelectedPrometheusDS([
        {
          label: existingConfig.prometheusDataSource.title,
          value: {
            id: existingConfig.prometheusDataSource.id,
            title: existingConfig.prometheusDataSource.title,
          },
        },
      ]);
    }
  }, [existingConfig, notifications]);

  // Show error toasts for hook errors
  useEffect(() => {
    if (datasetsError) {
      notifications.toasts.addWarning({
        title: 'Failed to load datasets',
        text: datasetsError.message || 'An error occurred while loading datasets.',
      });
    }
  }, [datasetsError, notifications]);

  useEffect(() => {
    if (prometheusError) {
      notifications.toasts.addWarning({
        title: 'Failed to load Prometheus data sources',
        text: prometheusError.message || 'An error occurred while loading Prometheus data sources.',
      });
    }
  }, [prometheusError, notifications]);

  useEffect(() => {
    if (correlatedLogsError) {
      notifications.toasts.addWarning({
        title: 'Failed to load correlated logs',
        text:
          correlatedLogsError.message || 'An error occurred while loading correlated log datasets.',
      });
    }
  }, [correlatedLogsError, notifications]);

  const validateForm = () => {
    const newErrors = {
      tracesDataset: [] as string[],
      serviceMapDataset: [] as string[],
      prometheusDataSource: [] as string[],
    };

    if (!formData.tracesDatasetId) {
      newErrors.tracesDataset.push('Traces dataset is required');
    }
    if (!formData.serviceMapDatasetId) {
      newErrors.serviceMapDataset.push('Service map dataset is required');
    }
    if (!formData.prometheusDataSourceId) {
      newErrors.prometheusDataSource.push('Prometheus data source is required');
    }

    setErrors(newErrors);
    const hasErrors = Object.values(newErrors).some((err) => err.length > 0);
    setShowErrors(hasErrors);
    return !hasErrors;
  };

  const handleApply = async () => {
    if (!validateForm()) {
      return;
    }

    if (!workspaceId) {
      notifications.toasts.addDanger({
        title: 'Cannot save configuration',
        text: 'No workspace ID found',
      });
      return;
    }

    setIsSaving(true);
    try {
      const client = OSDSavedApmConfigClient.getInstance();

<<<<<<< HEAD
      if (existingConfig?.objectId) {
        // Update existing config in place (atomic operation)
        await client.update({
          objectId: existingConfig.objectId,
          tracesDatasetId: formData.tracesDatasetId,
          serviceMapDatasetId: formData.serviceMapDatasetId,
          prometheusDataSourceId: formData.prometheusDataSourceId,
        });
      } else {
        // Create new config only when none exists
        await client.create({
          workspaceId,
          tracesDatasetId: formData.tracesDatasetId,
          serviceMapDatasetId: formData.serviceMapDatasetId,
          prometheusDataSourceId: formData.prometheusDataSourceId,
        });
      }

=======
      // Delete existing config if present
      if (existingConfig?.objectId) {
        await client.delete({ objectId: existingConfig.objectId });
      }

      // Create new config (always fresh)
      await client.create({
        workspaceId,
        tracesDatasetId: formData.tracesDatasetId,
        serviceMapDatasetId: formData.serviceMapDatasetId,
        prometheusDataSourceId: formData.prometheusDataSourceId,
      });

>>>>>>> b9ca851c (Add APM config and provider)
      notifications.toasts.addSuccess({
        title: existingConfig
          ? 'Configuration updated successfully'
          : 'Configuration saved successfully',
      });

      setShowErrors(false);
      // Auto-close modal on successful save, pass true to trigger refresh
      onClose(true);
    } catch (error) {
      notifications.toasts.addError(toError(error), {
        title: 'Failed to save configuration',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <EuiOverlayMask>
      <EuiModal onClose={() => onClose()} style={{ width: 700, maxWidth: '90vw' }}>
        <EuiModalHeader>
<<<<<<< HEAD
          <EuiModalHeaderTitle>
            {i18n.translate('observability.apm.settings.modalTitle', {
              defaultMessage: 'Application monitoring settings',
            })}
          </EuiModalHeaderTitle>
=======
          <EuiModalHeaderTitle>Application monitoring settings</EuiModalHeaderTitle>
>>>>>>> b9ca851c (Add APM config and provider)
        </EuiModalHeader>

        <EuiModalBody>
          {/* Architecture Diagram Accordion */}
          <EuiAccordion
            id="apm-architecture-accordion"
            buttonContent={
              <EuiText size="s">
<<<<<<< HEAD
                <strong>
                  {i18n.translate('observability.apm.settings.telemetryFlowTitle', {
                    defaultMessage: 'Application Telemetry Flow',
                  })}
                </strong>
=======
                <strong>Application Telemetry Flow</strong>
>>>>>>> b9ca851c (Add APM config and provider)
              </EuiText>
            }
            initialIsOpen={true}
            paddingSize="s"
          >
            <EuiText size="xs" color="subdued">
              <p>
<<<<<<< HEAD
                {i18n.translate('observability.apm.settings.telemetryFlowDescription', {
                  defaultMessage:
                    'Configure Data Prepper pipelines first to collect and export Traces, Services data, and RED metrics into OpenSearch datasets and into Prometheus.',
                })}
=======
                Configure Data Prepper pipelines first to collect and export Traces, Services data,
                and RED metrics into OpenSearch datasets and into Prometheus.
>>>>>>> b9ca851c (Add APM config and provider)
              </p>
            </EuiText>
            <EuiSpacer size="s" />
            <div style={{ textAlign: 'center', overflow: 'auto' }}>
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(
                  isDarkMode ? ApmArchitectureSvgDark : ApmArchitectureSvgLight
                )}`}
                alt="APM Architecture Diagram"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </div>
          </EuiAccordion>

          <EuiSpacer size="m" />

          {/* Configuration Form */}
          <EuiText size="s">
<<<<<<< HEAD
            <strong>
              {i18n.translate('observability.apm.settings.configureDataTitle', {
                defaultMessage: 'Configure data for Application Monitoring',
              })}
            </strong>
          </EuiText>
          <EuiText size="xs" color="subdued">
            <p>
              {i18n.translate('observability.apm.settings.configureDataDescription', {
                defaultMessage:
                  'Select the Traces, Services, RED Metric data store configured from the pipeline.',
              })}
            </p>
=======
            <strong>Configure data for Application Monitoring</strong>
          </EuiText>
          <EuiText size="xs" color="subdued">
            <p>Select the Traces, Services, RED Metric data store configured from the pipeline.</p>
>>>>>>> b9ca851c (Add APM config and provider)
          </EuiText>
          <EuiSpacer size="m" />

          {/* Active Configuration Banner - shown only when config exists and no form errors */}
          {existingConfig && !showErrors && (
            <>
              <EuiCallOut
<<<<<<< HEAD
                title={i18n.translate('observability.apm.settings.activeConfigTitle', {
                  defaultMessage: 'Active configuration exists',
                })}
=======
                title="Active configuration exists"
>>>>>>> b9ca851c (Add APM config and provider)
                color="success"
                iconType="check"
                size="s"
              >
                <p>
<<<<<<< HEAD
                  {i18n.translate('observability.apm.settings.activeConfigDescription', {
                    defaultMessage:
                      'This workspace has an active APM configuration. Update the options below and click Update to save your changes.',
                  })}
=======
                  This workspace has an active APM configuration. Update the options below and click
                  Update to save your changes.
>>>>>>> b9ca851c (Add APM config and provider)
                </p>
              </EuiCallOut>
              <EuiSpacer size="m" />
            </>
          )}

          <EuiForm component="form" isInvalid={showErrors}>
            {/* Traces Dataset */}
            <EuiFormRow
<<<<<<< HEAD
              label={i18n.translate('observability.apm.settings.tracesLabel', {
                defaultMessage: 'Traces',
              })}
              helpText={i18n.translate('observability.apm.settings.tracesHelpText', {
                defaultMessage: 'Select dataset for Trace data',
              })}
=======
              label="Traces"
              helpText="Select dataset for Trace data"
>>>>>>> b9ca851c (Add APM config and provider)
              isInvalid={showErrors && errors.tracesDataset.length > 0}
              error={errors.tracesDataset}
              fullWidth
            >
              <EuiComboBox
                compressed
<<<<<<< HEAD
                placeholder={i18n.translate('observability.apm.settings.tracesPlaceholder', {
                  defaultMessage: 'Select traces dataset',
                })}
=======
                placeholder="Select traces dataset"
>>>>>>> b9ca851c (Add APM config and provider)
                singleSelection={{ asPlainText: true }}
                options={tracesDatasets}
                selectedOptions={selectedTracesDataset}
                onChange={(selected) => {
                  setSelectedTracesDataset(selected);
                  setFormData({
                    ...formData,
                    tracesDatasetId: selected[0]?.value?.id || '',
                  });
                  if (selected.length > 0) {
                    setErrors({ ...errors, tracesDataset: [] });
                  }
                }}
                isLoading={datasetsLoading}
                isInvalid={showErrors && errors.tracesDataset.length > 0}
                append={
                  <EuiButtonIcon
                    iconType="refresh"
                    onClick={refreshDatasets}
                    isDisabled={datasetsLoading}
<<<<<<< HEAD
                    aria-label={i18n.translate(
                      'observability.apm.settings.refreshDatasetsAriaLabel',
                      {
                        defaultMessage: 'Refresh datasets',
                      }
                    )}
=======
                    aria-label="Refresh datasets"
>>>>>>> b9ca851c (Add APM config and provider)
                  />
                }
                fullWidth
              />
            </EuiFormRow>

            {/* Correlated Logs Accordion */}
            {formData.tracesDatasetId && (
              <>
                <EuiSpacer size="s" />
                <EuiAccordion
                  id="correlated-logs-accordion"
                  buttonContent={
                    <EuiText size="xs">
<<<<<<< HEAD
                      <strong>
                        {i18n.translate('observability.apm.settings.correlatedLogsTitle', {
                          defaultMessage: 'Correlated Logs',
                        })}
                      </strong>
=======
                      <strong>Correlated Logs</strong>
>>>>>>> b9ca851c (Add APM config and provider)
                      {correlatedLogs.length > 0 && (
                        <EuiBadge color="hollow" style={{ marginLeft: '8px' }}>
                          {correlatedLogs.length}
                        </EuiBadge>
                      )}
                    </EuiText>
                  }
                  extraAction={
                    <EuiButtonEmpty
                      size="xs"
                      onClick={() => {
                        CoreStartProp.application.navigateToApp('datasets', {
                          path: `/patterns/${formData.tracesDatasetId}#/?_a=(tab:correlatedDatasets)`,
                        });
                      }}
                    >
                      {correlatedLogs.length === 0
<<<<<<< HEAD
                        ? i18n.translate('observability.apm.settings.viewCorrelatedLogs', {
                            defaultMessage: 'View correlated logs',
                          })
                        : i18n.translate('observability.apm.settings.updateCorrelatedLogs', {
                            defaultMessage: 'Update correlated logs',
                          })}
=======
                        ? 'View correlated logs'
                        : 'Update correlated logs'}
>>>>>>> b9ca851c (Add APM config and provider)
                    </EuiButtonEmpty>
                  }
                  initialIsOpen={false}
                  paddingSize="s"
                >
                  {correlatedLogsLoading ? (
                    <EuiText size="xs" color="subdued">
<<<<<<< HEAD
                      {i18n.translate('observability.apm.settings.loadingCorrelatedLogs', {
                        defaultMessage: 'Loading correlated logs...',
                      })}
=======
                      Loading correlated logs...
>>>>>>> b9ca851c (Add APM config and provider)
                    </EuiText>
                  ) : correlatedLogs.length > 0 ? (
                    <div>
                      <EuiText size="xs" color="subdued">
<<<<<<< HEAD
                        <p>
                          {i18n.translate('observability.apm.settings.correlatedLogsDescription', {
                            defaultMessage:
                              'The following log datasets are correlated with this trace dataset:',
                          })}
                        </p>
=======
                        <p>The following log datasets are correlated with this trace dataset:</p>
>>>>>>> b9ca851c (Add APM config and provider)
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
<<<<<<< HEAD
                      {i18n.translate('observability.apm.settings.noCorrelatedLogs', {
                        defaultMessage: 'No correlated log datasets found for this trace dataset.',
                      })}
=======
                      No correlated log datasets found for this trace dataset.
>>>>>>> b9ca851c (Add APM config and provider)
                    </EuiText>
                  )}
                </EuiAccordion>
                <EuiSpacer size="s" />
              </>
            )}

            {/* Service Map Dataset */}
            <EuiFormRow
<<<<<<< HEAD
              label={i18n.translate('observability.apm.settings.servicesLabel', {
                defaultMessage: 'Services',
              })}
              helpText={i18n.translate('observability.apm.settings.servicesHelpText', {
                defaultMessage: 'Select dataset for Services Map data',
              })}
=======
              label="Services"
              helpText="Select dataset for Services Map data"
>>>>>>> b9ca851c (Add APM config and provider)
              isInvalid={showErrors && errors.serviceMapDataset.length > 0}
              error={errors.serviceMapDataset}
              fullWidth
            >
              <EuiComboBox
                compressed
<<<<<<< HEAD
                placeholder={i18n.translate('observability.apm.settings.servicesPlaceholder', {
                  defaultMessage: 'Select service map dataset',
                })}
=======
                placeholder="Select service map dataset"
>>>>>>> b9ca851c (Add APM config and provider)
                singleSelection={{ asPlainText: true }}
                options={allDatasets}
                selectedOptions={selectedServiceMapDataset}
                onChange={(selected) => {
                  setSelectedServiceMapDataset(selected);
                  setFormData({
                    ...formData,
                    serviceMapDatasetId: selected[0]?.value?.id || '',
                  });
                  if (selected.length > 0) {
                    setErrors({ ...errors, serviceMapDataset: [] });
                  }
                }}
                isLoading={datasetsLoading}
                isInvalid={showErrors && errors.serviceMapDataset.length > 0}
                append={
                  <EuiButtonIcon
                    iconType="refresh"
                    onClick={refreshDatasets}
                    isDisabled={datasetsLoading}
<<<<<<< HEAD
                    aria-label={i18n.translate(
                      'observability.apm.settings.refreshDatasetsAriaLabel',
                      {
                        defaultMessage: 'Refresh datasets',
                      }
                    )}
=======
                    aria-label="Refresh datasets"
>>>>>>> b9ca851c (Add APM config and provider)
                  />
                }
                fullWidth
              />
            </EuiFormRow>

            <EuiSpacer size="m" />

            {/* Prometheus Data Source */}
            <EuiFormRow
<<<<<<< HEAD
              label={i18n.translate('observability.apm.settings.redMetricsLabel', {
                defaultMessage: 'RED Metrics',
              })}
              helpText={i18n.translate('observability.apm.settings.redMetricsHelpText', {
                defaultMessage: 'Select a Prometheus data source',
              })}
=======
              label="RED Metrics"
              helpText="Select a Prometheus data source"
>>>>>>> b9ca851c (Add APM config and provider)
              isInvalid={showErrors && errors.prometheusDataSource.length > 0}
              error={errors.prometheusDataSource}
              fullWidth
            >
              <EuiComboBox
                compressed
<<<<<<< HEAD
                placeholder={i18n.translate('observability.apm.settings.redMetricsPlaceholder', {
                  defaultMessage: 'Select Prometheus data source',
                })}
=======
                placeholder="Select Prometheus data source"
>>>>>>> b9ca851c (Add APM config and provider)
                singleSelection={{ asPlainText: true }}
                options={prometheusDataSources}
                selectedOptions={selectedPrometheusDS}
                onChange={(selected) => {
                  setSelectedPrometheusDS(selected);
                  setFormData({
                    ...formData,
                    prometheusDataSourceId: selected[0]?.value?.id || '',
                  });
                  if (selected.length > 0) {
                    setErrors({ ...errors, prometheusDataSource: [] });
                  }
                }}
                isLoading={prometheusLoading}
                isInvalid={showErrors && errors.prometheusDataSource.length > 0}
                append={
                  <EuiButtonIcon
                    iconType="refresh"
                    onClick={refreshPrometheus}
                    isDisabled={prometheusLoading}
<<<<<<< HEAD
                    aria-label={i18n.translate(
                      'observability.apm.settings.refreshDataSourcesAriaLabel',
                      {
                        defaultMessage: 'Refresh data sources',
                      }
                    )}
=======
                    aria-label="Refresh data sources"
>>>>>>> b9ca851c (Add APM config and provider)
                  />
                }
                fullWidth
              />
            </EuiFormRow>
          </EuiForm>
        </EuiModalBody>

        <EuiModalFooter>
<<<<<<< HEAD
          <EuiButtonEmpty onClick={() => onClose()}>
            {i18n.translate('observability.apm.settings.cancelButton', {
              defaultMessage: 'Cancel',
            })}
          </EuiButtonEmpty>
          <EuiButton fill onClick={handleApply} isLoading={isSaving} disabled={isSaving}>
            {existingConfig
              ? i18n.translate('observability.apm.settings.updateButton', {
                  defaultMessage: 'Update',
                })
              : i18n.translate('observability.apm.settings.applyButton', {
                  defaultMessage: 'Apply',
                })}
=======
          <EuiButtonEmpty onClick={() => onClose()}>Cancel</EuiButtonEmpty>
          <EuiButton fill onClick={handleApply} isLoading={isSaving} disabled={isSaving}>
            {existingConfig ? 'Update' : 'Apply'}
>>>>>>> b9ca851c (Add APM config and provider)
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>
    </EuiOverlayMask>
  );
};
