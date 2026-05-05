/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create Monitor — flyout workflow for creating either a Prometheus (PromQL)
 * or OpenSearch monitor. The user picks the target datasource first, which
 * determines the form variant shown.
 *
 * This file is the flyout shell — owns state, routes to either the Prometheus
 * or OpenSearch form section, and handles save/validation. Sub-files:
 *   - `create_monitor_types.ts`      — types, defaults, option arrays
 *   - `prometheus_form_section.tsx`  — PromQL-backed form body
 *   - `opensearch_form_section.tsx`  — OpenSearch monitor form body
 *
 * Re-exports `MonitorFormState` so existing consumers importing from
 * `'./create_monitor'` continue to work unchanged.
 */
import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { Datasource, UnifiedAlertSeverity } from '../../../../common/types/alerting';
import {
  MonitorFormState as ValidatorFormState,
  validateMonitorForm,
} from '../../../../common/services/alerting/validators';
import { validatePromQL } from '../promql_editor';
import { MonitorTemplateWizard, AlertTemplate } from '../monitor_template_wizard';
import { DatasourceTargetSelector, MonitorBackendType } from '../monitor_form_components';
import {
  DEFAULT_OS_FORM,
  DEFAULT_PROM_FORM,
  MonitorFormState,
  OpenSearchFormState,
  PrometheusFormState,
  SEVERITY_OPTIONS,
} from './create_monitor_types';
import { PrometheusFormSection } from './prometheus_form_section';
import { OpenSearchFormSection } from './opensearch_form_section';

// Re-export the shared form-state type so existing consumers that import
// `MonitorFormState` from `'./create_monitor'` keep working unchanged.
export type { MonitorFormState } from './create_monitor_types';

// ============================================================================
// Main Component — Flyout
// ============================================================================

export interface CreateMonitorProps {
  onSave: (monitor: MonitorFormState) => void;
  /** Batch save for AI-generated monitors (does not close the flyout) */
  onBatchSave?: (monitors: MonitorFormState[]) => void;
  onCancel: () => void;
  /** All selectable datasources (including workspace-scoped Prometheus entries) */
  datasources: Datasource[];
  /** Pre-selected datasource IDs from the parent page */
  selectedDsIds?: string[];
  context?: { service?: string; team?: string };
}

type CreationMode = 'manual' | 'ai';

export const CreateMonitor: React.FC<CreateMonitorProps> = ({
  onSave,
  onBatchSave,
  onCancel,
  datasources,
  selectedDsIds,
  context,
}) => {
  // Determine initial datasource from parent selection
  const initialDs = useMemo(() => {
    if (selectedDsIds && selectedDsIds.length > 0) {
      const ds = datasources.find((d) => d.id === selectedDsIds[0]);
      if (ds) return ds;
    }
    return null;
  }, [datasources, selectedDsIds]);

  const initialType: MonitorBackendType =
    initialDs?.type === 'opensearch' ? 'opensearch' : 'prometheus';

  const [creationMode, setCreationMode] = useState<CreationMode>('manual');
  const [backendType, setBackendType] = useState<MonitorBackendType>(initialType);
  const [promForm, setPromForm] = useState<PrometheusFormState>({
    ...DEFAULT_PROM_FORM,
    datasourceId: initialType === 'prometheus' && initialDs ? initialDs.id : '',
  });
  const [osForm, setOsForm] = useState<OpenSearchFormState>({
    ...DEFAULT_OS_FORM,
    datasourceId: initialType === 'opensearch' && initialDs ? initialDs.id : '',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const updateProm = <K extends keyof PrometheusFormState>(
    key: K,
    value: PrometheusFormState[K]
  ) => {
    setPromForm((prev) => ({ ...prev, [key]: value }));
  };
  const updateOs = <K extends keyof OpenSearchFormState>(key: K, value: OpenSearchFormState[K]) => {
    setOsForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleDatasourceChange = (id: string, type: MonitorBackendType) => {
    setBackendType(type);
    // Reset to manual if switching away from Prometheus
    if (type !== 'prometheus' && creationMode === 'ai') {
      setCreationMode('manual');
    }
    if (type === 'prometheus') {
      setPromForm((prev) => ({ ...prev, datasourceId: id }));
    } else {
      setOsForm((prev) => ({ ...prev, datasourceId: id }));
    }
  };

  // Shared fields
  const activeForm = backendType === 'prometheus' ? promForm : osForm;
  const updateName = (name: string) => {
    if (backendType === 'prometheus') updateProm('name', name);
    else updateOs('name', name);
  };
  const updateSeverity = (sev: UnifiedAlertSeverity) => {
    if (backendType === 'prometheus') updateProm('severity', sev);
    else updateOs('severity', sev);
  };
  const updateEnabled = (enabled: boolean) => {
    if (backendType === 'prometheus') updateProm('enabled', enabled);
    else updateOs('enabled', enabled);
  };

  // Validation
  const queryErrors = backendType === 'prometheus' ? validatePromQL(promForm.query) : [];
  const hasQueryErrors = queryErrors.some((e) => e.severity === 'error');
  const isValid =
    activeForm.name.trim() !== '' &&
    activeForm.datasourceId !== '' &&
    (backendType === 'prometheus'
      ? promForm.query.trim() !== '' && !hasQueryErrors
      : osForm.monitorType === 'ppl_monitor'
      ? osForm.query.trim() !== ''
      : osForm.monitorType === 'cluster_metrics_monitor'
      ? osForm.clusterMetricsApiType.trim() !== ''
      : osForm.indices.trim() !== '' && osForm.triggerCondition.trim() !== '');

  const handleSave = () => {
    setHasSubmitted(true);
    if (backendType === 'prometheus') {
      const result = validateMonitorForm(promForm as ValidatorFormState);
      if (!result.valid) {
        setValidationErrors(result.errors);
        return;
      }
      setValidationErrors({});
      onSave(promForm);
    } else {
      const errors: Record<string, string> = {};
      if (osForm.monitorType === 'ppl_monitor') {
        if (!osForm.query.trim()) errors.query = 'PPL query is required';
      } else if (osForm.monitorType === 'cluster_metrics_monitor') {
        if (!osForm.clusterMetricsApiType.trim())
          errors.clusterMetricsApiType = 'API type is required';
      } else {
        if (!osForm.indices.trim()) errors.indices = 'At least one index pattern is required';
        if (!osForm.triggerCondition.trim())
          errors.triggerCondition = 'Trigger condition is required';
      }
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }
      setValidationErrors({});
      onSave(osForm);
    }
  };

  // When AI wizard is active and user is on a Prometheus datasource, delegate to MonitorTemplateWizard
  if (creationMode === 'ai' && backendType === 'prometheus') {
    return (
      <MonitorTemplateWizard
        onClose={onCancel}
        onCreateMonitors={(templates: AlertTemplate[]) => {
          // Convert AI templates to MonitorFormState
          const forms: PrometheusFormState[] = templates.map((t) => ({
            datasourceType: 'prometheus' as const,
            datasourceId: promForm.datasourceId,
            name: t.name,
            query: t.query,
            threshold: { operator: '>' as const, value: 0, unit: '', forDuration: t.forDuration },
            evaluationInterval: t.evaluationInterval,
            pendingPeriod: t.forDuration,
            firingPeriod: t.forDuration,
            labels: Object.entries(t.labels).map(([key, value]) => ({ key, value })),
            annotations: Object.entries(t.annotations).map(([key, value]) => ({ key, value })),
            severity: t.severity,
            enabled: true,
          }));
          // Use batch save to add all without closing the flyout
          if (onBatchSave) {
            onBatchSave(forms);
          } else {
            forms.forEach((f) => onSave(f));
          }
        }}
      />
    );
  }

  return (
    <EuiFlyout onClose={onCancel} size="l" ownFocus aria-labelledby="createMonitorFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="createMonitorFlyoutTitle">
            Create {backendType === 'prometheus' ? 'Metrics' : 'Logs'} Monitor
          </h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          {backendType === 'prometheus'
            ? 'PromQL-based alerting rule'
            : 'Query-level monitor with triggers'}
        </EuiText>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {/* Target Datasource */}
        <DatasourceTargetSelector
          datasources={datasources}
          selectedId={activeForm.datasourceId}
          onChange={handleDatasourceChange}
        />

        <EuiSpacer size="m" />

        {/* Creation Mode Toggle — AI only available for Prometheus */}
        {backendType === 'prometheus' && (
          <>
            <EuiPanel paddingSize="s" hasBorder>
              <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs">
                    <strong>Creation method</strong>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup gutterSize="xs" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiBadge
                        color={creationMode === 'manual' ? 'primary' : 'hollow'}
                        onClick={() => setCreationMode('manual')}
                        onClickAriaLabel="Manual creation"
                      >
                        Manual
                      </EuiBadge>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiBadge
                        color={creationMode === 'ai' ? 'secondary' : 'hollow'}
                        onClick={() => setCreationMode('ai')}
                        onClickAriaLabel="Create from template"
                        iconType="sparkles"
                      >
                        From template
                      </EuiBadge>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
            <EuiSpacer size="m" />
          </>
        )}

        {/* Monitor Name */}
        <EuiFormRow
          label="Monitor Name"
          fullWidth
          isInvalid={hasSubmitted && (!!validationErrors.name || activeForm.name.trim() === '')}
          error={
            hasSubmitted
              ? validationErrors.name ||
                (activeForm.name.trim() === '' ? 'Name is required' : undefined)
              : undefined
          }
        >
          <EuiFieldText
            placeholder={
              backendType === 'prometheus'
                ? 'e.g. HighCpuUsage, PaymentErrorRate'
                : 'e.g. High Error Rate, Disk Usage Alert'
            }
            value={activeForm.name}
            onChange={(e) => updateName(e.target.value)}
            fullWidth
            aria-label="Monitor name"
          />
        </EuiFormRow>

        <EuiSpacer size="m" />

        {/* Severity + Enabled */}
        <EuiFlexGroup gutterSize="m" alignItems="center">
          <EuiFlexItem grow={3}>
            <EuiFormRow label="Severity" display="rowCompressed">
              <EuiSelect
                options={SEVERITY_OPTIONS}
                value={activeForm.severity}
                onChange={(e) => updateSeverity(e.target.value as UnifiedAlertSeverity)}
                compressed
                aria-label="Severity"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiFormRow label="Enabled" display="rowCompressed">
              <EuiSwitch
                label=""
                checked={activeForm.enabled}
                onChange={(e) => updateEnabled(e.target.checked)}
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {/* Backend-specific form */}
        {backendType === 'prometheus' ? (
          <PrometheusFormSection
            form={promForm}
            onUpdate={updateProm}
            validationErrors={validationErrors}
            hasSubmitted={hasSubmitted}
            context={context}
          />
        ) : (
          <OpenSearchFormSection
            form={osForm}
            onUpdate={updateOs}
            validationErrors={validationErrors}
            hasSubmitted={hasSubmitted}
            context={context}
          />
        )}
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onCancel}>Cancel</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiButton onClick={handleSave} isDisabled={!isValid}>
                  Save Monitor
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton fill onClick={handleSave} isDisabled={!isValid}>
                  Save &amp; Enable
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
