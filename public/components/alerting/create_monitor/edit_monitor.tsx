/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Edit Monitor flyout — thin wrapper around `CreateMonitor` that pre-fills
 * form state from `useRuleDetail` and dispatches updates instead of creates.
 *
 * Only OpenSearch PPL monitors (`monitor_type === 'ppl_monitor'`) are
 * editable; other monitor types render a "not supported" message.
 */
import React, { useEffect, useState } from 'react';
import {
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { Datasource, UnifiedRule } from '../../../../common/types/alerting';
import { useRuleDetail } from '../hooks/use_rule_detail';
import { unifiedRuleToOsForm } from '../../../../common/services/alerting/form_transforms';
import { CreateMonitor, MonitorFormState } from './index';
import {
  DEFAULT_OS_FORM,
  OpenSearchFormState,
  PplActionForm,
  PplTriggerForm,
} from './create_monitor_types';

export interface EditMonitorProps {
  dsId: string;
  ruleId: string;
  onCancel: () => void;
  onSave: (form: MonitorFormState, ruleId: string) => Promise<void> | void;
  datasources: Datasource[];
  selectedDsIds?: string[];
}

/**
 * Apply the form-seed produced by `unifiedRuleToOsForm` on top of
 * `DEFAULT_OS_FORM` so unspecified DSL/cluster-metrics fields keep their
 * defaults (the form-state type requires them).
 *
 * Triggers and actions come back from the seeder without React keys; we
 * patch in fresh `id`s here so row keying stays stable on re-render.
 */
function buildEditFormFromRule(rule: UnifiedRule, datasources: Datasource[]): OpenSearchFormState {
  const seed = unifiedRuleToOsForm({
    name: rule.name,
    enabled: rule.enabled,
    raw: rule.raw,
  });

  const pplTriggers: PplTriggerForm[] = seed.pplTriggers.map((t, idx) => ({
    ...t,
    id: t.id || `ppl-trigger-${rule.id}-${idx}`,
    actions: t.actions.map(
      (a, ai): PplActionForm => ({
        ...a,
        id: a.id || `ppl-action-${rule.id}-${idx}-${ai}`,
      })
    ),
  }));

  const datasourceId =
    datasources.find((d) => d.id === rule.datasourceId)?.id ?? rule.datasourceId ?? '';

  return {
    ...DEFAULT_OS_FORM,
    name: seed.name,
    enabled: seed.enabled,
    query: seed.query,
    schedule: seed.schedule,
    pplTriggers,
    monitorType: 'ppl_monitor',
    severity: rule.severity,
    datasourceId,
  };
}

export const EditMonitor: React.FC<EditMonitorProps> = ({
  dsId,
  ruleId,
  onCancel,
  onSave,
  datasources,
  selectedDsIds,
}) => {
  const { data, isLoading, error } = useRuleDetail(dsId, ruleId);
  const [seededForm, setSeededForm] = useState<OpenSearchFormState | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    if (data.datasourceType !== 'opensearch') {
      setUnsupported(
        'Editing Prometheus rule groups is not supported yet. This will land in a follow-up release.'
      );
      return;
    }
    if (data.monitorType !== 'ppl') {
      setUnsupported(
        'Editing this monitor type is not supported yet — only PPL monitors can be edited from this flyout.'
      );
      return;
    }
    setSeededForm(buildEditFormFromRule(data, datasources));
  }, [data, datasources]);

  if (isLoading || (!data && !error)) {
    return (
      <EuiFlyout onClose={onCancel} size="l" ownFocus aria-labelledby="editMonitorLoadingTitle">
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2 id="editMonitorLoadingTitle">Loading monitor…</h2>
          </EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiLoadingSpinner size="l" />
          <EuiSpacer size="s" />
          <EuiText size="s">Fetching monitor details…</EuiText>
        </EuiFlyoutBody>
      </EuiFlyout>
    );
  }

  if (error) {
    return (
      <EuiFlyout onClose={onCancel} size="l" ownFocus aria-labelledby="editMonitorErrorTitle">
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2 id="editMonitorErrorTitle">Failed to load monitor</h2>
          </EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiText size="s" color="danger">
            {error.message}
          </EuiText>
        </EuiFlyoutBody>
      </EuiFlyout>
    );
  }

  if (unsupported) {
    return (
      <EuiFlyout onClose={onCancel} size="l" ownFocus aria-labelledby="editMonitorUnsupportedTitle">
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2 id="editMonitorUnsupportedTitle">Edit not supported</h2>
          </EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiText size="s">{unsupported}</EuiText>
        </EuiFlyoutBody>
      </EuiFlyout>
    );
  }

  if (!seededForm) {
    return null;
  }

  return (
    <CreateMonitor
      mode="edit"
      initialForm={seededForm}
      onSave={(form) => onSave(form, ruleId)}
      onCancel={onCancel}
      datasources={datasources}
      selectedDsIds={selectedDsIds}
    />
  );
};
