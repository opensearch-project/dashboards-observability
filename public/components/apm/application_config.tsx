/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiForm,
  EuiFormRow,
  EuiComboBox,
  EuiButton,
  EuiText,
  EuiCallOut,
  EuiPanel,
  EuiAccordion,
  EuiDescribedFormGroup,
  EuiButtonIcon,
  EuiBadge,
} from '@elastic/eui';
import {
  ChromeBreadcrumb,
  ChromeStart,
  NotificationsStart,
  CoreStart,
} from '../../../../../src/core/public';
import { getWorkspaceIdFromUrl } from '../../../../../src/core/public/utils';
import { useDatasets, usePrometheusDataSources, useCorrelatedLogs } from './config/hooks';
import { OSDSavedApmConfigClient } from '../../services/saved_objects/saved_object_client/osd_saved_objects/apm_config';
import { ApmArchitectureSvgLight, ApmArchitectureSvgDark } from './config/apm-architecture-svg';
import { AppPluginStartDependencies } from '../../types';
import { ResolvedApmConfig } from '../../../common/types/observability_saved_object_attributes';

/**
 * Type guard to safely check if an unknown value is an Error
 */
function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export interface ApmApplicationConfigProps {
  chrome: ChromeStart;
  parentBreadcrumb: ChromeBreadcrumb;
  notifications: NotificationsStart;
  CoreStartProp: CoreStart;
  DepsStart: AppPluginStartDependencies;
  [key: string]: unknown;
}

export const ApplicationConfig = (props: ApmApplicationConfigProps) => {
  const { chrome, notifications, CoreStartProp, DepsStart } = props;

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

  // Load existing config
  const [existingConfig, setExistingConfig] = useState<ResolvedApmConfig | null>(null);
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
  } = usePrometheusDataSources();

  // Load correlated log datasets for the selected trace dataset
  const {
    data: correlatedLogs,
    loading: correlatedLogsLoading,
    error: correlatedLogsError,
  } = useCorrelatedLogs(dataService, savedObjectsClient, formData.tracesDatasetId);

  // Set breadcrumbs (without parent)
  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Application Monitoring Configuration',
        href: '#/application-config',
      },
    ]);
  }, [chrome]);

  // Load existing config on mount
  useEffect(() => {
    loadExistingConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const loadExistingConfig = async () => {
    try {
      const client = OSDSavedApmConfigClient.getInstance();
      const { configs } = await client.getBulkWithResolvedReferences({ perPage: 1 });

      if (configs.length > 0) {
        const config = configs[0];

        // Validate all required references exist
        const hasAllReferences =
          config.tracesDataset?.id &&
          config.serviceMapDataset?.id &&
          config.prometheusDataSource?.id;

        if (!hasAllReferences) {
          // Show error notification
          notifications.toasts.addWarning({
            title: 'Configuration could not be loaded',
            text: 'Some referenced data sources are missing or unavailable. Please reconfigure.',
          });
          // Leave form empty
          setExistingConfig(null);
          return;
        }

        // All valid - populate form
        setExistingConfig(config);
        setFormData({
          tracesDatasetId: config.tracesDataset.id,
          serviceMapDatasetId: config.serviceMapDataset.id,
          prometheusDataSourceId: config.prometheusDataSource.id,
        });

        // Set selected options
        setSelectedTracesDataset([
          {
            label: config.tracesDataset.title,
            value: { id: config.tracesDataset.id, title: config.tracesDataset.title },
          },
        ]);
        setSelectedServiceMapDataset([
          {
            label: config.serviceMapDataset.title,
            value: { id: config.serviceMapDataset.id, title: config.serviceMapDataset.title },
          },
        ]);
        setSelectedPrometheusDS([
          {
            label: config.prometheusDataSource.title,
            value: { id: config.prometheusDataSource.id, title: config.prometheusDataSource.title },
          },
        ]);
      }
    } catch (error) {
      console.error('Error loading APM config:', error);
      const err = toError(error);
      notifications.toasts.addDanger({
        title: 'Failed to load configuration',
        text: err.message || 'An error occurred while loading the configuration.',
      });
      setExistingConfig(null);
    }
  };

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

  const handleSave = async () => {
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

      notifications.toasts.addSuccess({
        title: existingConfig
          ? 'Configuration updated successfully'
          : 'Configuration saved successfully',
      });

      setShowErrors(false);
      await loadExistingConfig();
    } catch (error) {
      notifications.toasts.addError(toError(error), {
        title: 'Failed to save configuration',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <EuiPage>
      <EuiPageBody>
        {/* Architecture Diagram Accordion */}
        <EuiPanel>
          <EuiAccordion
            id="apm-architecture-accordion"
            buttonContent={
              <EuiText>
                <h3>Application Telemetry Flow</h3>
              </EuiText>
            }
            initialIsOpen={true}
            paddingSize="s"
          >
            <EuiText size="s" color="subdued">
              <p>
                This diagram illustrates the flow of telemetry collected from your applications and
                services, processed through the data pipeline, and stored in OpenSearch for analysis
                and visualization. The configuration below allows you to specify the data sources
                for traces, service maps, and metrics to enable comprehensive observability.
              </p>
            </EuiText>
            <EuiSpacer size="m" />
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
        </EuiPanel>

        <EuiSpacer size="m" />

        {/* Configuration Form */}
        <EuiPanel>
          <EuiText>
            <h3>Configuration</h3>
          </EuiText>
          <EuiSpacer size="m" />

          {/* Active Configuration Banner */}
          {existingConfig && !showErrors && (
            <>
              <EuiCallOut title="Active Configuration" color="success" iconType="check">
                <p>
                  Workspace has an active APM configuration. To change the configuration options,
                  update the form and click on update configuration.
                </p>
              </EuiCallOut>
              <EuiSpacer size="m" />
            </>
          )}
          <EuiForm component="form" isInvalid={showErrors}>
            {/* Traces Dataset */}
            <EuiDescribedFormGroup
              title={<h3>Traces</h3>}
              description="Select the dataset that contains your distributed trace and span data. This dataset should include trace IDs, span IDs, and timing information for end-to-end request tracking."
              fullWidth
            >
              <EuiFormRow
                label="Traces Dataset"
                helpText="Index pattern containing trace/span data (e.g., otel-v1-apm-span-*)"
                isInvalid={showErrors && errors.tracesDataset.length > 0}
                error={errors.tracesDataset}
                fullWidth
              >
                <EuiComboBox
                  compressed
                  placeholder="Select traces dataset"
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
                      aria-label="Refresh datasets"
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
                      <EuiText size="s">
                        <strong>Correlated Logs</strong>
                        {correlatedLogs.length > 0 && (
                          <EuiBadge color="hollow" style={{ marginLeft: '8px' }}>
                            {correlatedLogs.length}
                          </EuiBadge>
                        )}
                      </EuiText>
                    }
                    extraAction={
                      <EuiButton
                        size="s"
                        onClick={() => {
                          CoreStartProp.application.navigateToApp('datasets', {
                            path: `/patterns/${formData.tracesDatasetId}#/?_a=(tab:correlatedDatasets)`,
                          });
                        }}
                      >
                        {correlatedLogs.length === 0
                          ? 'View correlated logs'
                          : 'Update correlated logs'}
                      </EuiButton>
                    }
                    initialIsOpen={true}
                    paddingSize="m"
                  >
                    {correlatedLogsLoading ? (
                      <EuiText size="s" color="subdued">
                        Loading correlated logs...
                      </EuiText>
                    ) : correlatedLogs.length > 0 ? (
                      <div>
                        <EuiText size="xs" color="subdued">
                          <p>The following log datasets are correlated with this trace dataset:</p>
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
                      <EuiText size="s" color="subdued">
                        No correlated log datasets found for this trace dataset.
                      </EuiText>
                    )}
                  </EuiAccordion>
                </>
              )}
            </EuiDescribedFormGroup>

            {/* Service Map Dataset */}
            <EuiDescribedFormGroup
              title={<h3>Service Map </h3>}
              description="Select the dataset for service topology and dependency mapping data. This enables visualization of service-to-service communication and dependencies in your distributed system."
              fullWidth
            >
              <EuiFormRow
                label="Service Map Dataset"
                helpText="Dataset for service map data (e.g., otel-v1-apm-service-map*)"
                isInvalid={showErrors && errors.serviceMapDataset.length > 0}
                error={errors.serviceMapDataset}
                fullWidth
              >
                <EuiComboBox
                  compressed
                  placeholder="Select service map dataset"
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
                      aria-label="Refresh datasets"
                    />
                  }
                  fullWidth
                />
              </EuiFormRow>
            </EuiDescribedFormGroup>

            {/* Prometheus Data Source */}
            <EuiDescribedFormGroup
              title={<h3>Metrics</h3>}
              description="Select the Prometheus data source for RED (Rate, Error, Duration) metrics. This provides real-time performance metrics aggregated from your application telemetry."
              fullWidth
            >
              <EuiFormRow
                label="Prometheus Data Source"
                helpText="Prometheus data source for RED metrics collection"
                isInvalid={showErrors && errors.prometheusDataSource.length > 0}
                error={errors.prometheusDataSource}
                fullWidth
              >
                <EuiComboBox
                  compressed
                  placeholder="Select Prometheus data source"
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
                      aria-label="Refresh data sources"
                    />
                  }
                  fullWidth
                />
              </EuiFormRow>
            </EuiDescribedFormGroup>

            <EuiSpacer size="l" />

            <EuiButton fill onClick={handleSave} isLoading={isSaving} disabled={isSaving}>
              {existingConfig ? 'Update Configuration' : 'Save Configuration'}
            </EuiButton>
          </EuiForm>
        </EuiPanel>
      </EuiPageBody>
    </EuiPage>
  );
};
