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
import { FormattedMessage } from '@osd/i18n/react';
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

/** Convert seconds to a human-readable duration string (e.g., 60 → "1m"). */
function formatSeconds(sec: number): string {
  if (sec <= 0) return '1m';
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

/**
 * Normalize a duration string like "120s" to the canonical form used in
 * dropdown options ("2m"). Handles "Ns" → minutes/hours conversion.
 */
function normalizeDuration(dur: string): string {
  if (!dur) return '5m';
  // Already in m/h/d format
  if (/^\d+[mhd]$/.test(dur)) return dur;
  // Convert "Ns" to minutes if evenly divisible
  const secMatch = dur.match(/^(\d+)s$/);
  if (secMatch) {
    const sec = parseInt(secMatch[1], 10);
    return formatSeconds(sec);
  }
  return dur;
}

export interface EditMonitorProps {
  dsId: string;
  ruleId: string;
  onCancel: () => void;
  onSave: (form: MonitorFormState, ruleId: string) => Promise<void> | void;
  datasources: Datasource[];
  selectedDsIds?: string[];
  /**
   * Forwarded to {@link CreateMonitor.isNameTaken}. Callers should already
   * exclude this monitor's own ruleId so renaming back to the current value
   * is allowed.
   */
  isNameTaken?: (trimmedName: string, dsId: string) => boolean;
  /** Forwarded to {@link CreateMonitor.submitError}. */
  submitError?: { pplMessage?: string };
  /** Forwarded to {@link CreateMonitor.onClearPplSubmitError}. */
  onClearPplSubmitError?: () => void;
}

/**
 * Apply the form-seed produced by `unifiedRuleToOsForm` on top of
 * `DEFAULT_OS_FORM`. The form authors PPL only — DSL / cluster-metrics
 * monitors are read-only in the Rules table, so seeding to the PPL shape
 * is sufficient.
 *
 * Triggers and actions come back from the seeder without React keys; we
 * patch in fresh `id`s here so row keying stays stable on re-render.
 */
// Best-effort extraction of the index list from a PPL `source = ...` clause.
// Examples handled:
//   `source = logs-* | where ...`           -> ['logs-*']
//   `source = logs-*, metrics-*`            -> ['logs-*', 'metrics-*']
//   `source=prod:traces-* |\n  stats ...`   -> ['prod:traces-*']
// Anything that doesn't match returns []. The picker tolerates missing
// indices — the user can re-add them inline.
const SOURCE_CLAUSE_RE = /^\s*source\s*=\s*([^|]+?)(?:\s*\||\s*$)/i;
function parseIndicesFromPpl(query: string): string[] {
  const m = query.match(SOURCE_CLAUSE_RE);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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

  // Prefer the parsed `source = ...` clause; fall back to the `indices`
  // label we stamped in `formStateToRule` for round-trip stability.
  const parsedIndices = parseIndicesFromPpl(seed.query);
  const labelIndices = (rule.labels?.indices ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const indices = parsedIndices.length > 0 ? parsedIndices : labelIndices;

  return {
    ...DEFAULT_OS_FORM,
    name: seed.name,
    enabled: seed.enabled,
    query: seed.query,
    schedule: seed.schedule,
    pplTriggers,
    indices,
    timeField: '',
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
  isNameTaken,
  submitError,
  onClearPplSubmitError,
}) => {
  const { data, isLoading, error } = useRuleDetail(dsId, ruleId);
  const [seededForm, setSeededForm] = useState<MonitorFormState | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    if (data.datasourceType === 'prometheus') {
      // Prometheus rule edit — seed from the unified rule summary + raw data.
      // The summary carries pre-parsed human-readable fields; raw has the
      // Cortex wire format which may use empty strings or numeric seconds.
      const raw = (data.raw || {}) as Record<string, unknown>;
      const rules = (raw.rules as Array<Record<string, unknown>>) || [];
      const firstRule = rules[0] || {};
      const expr = String(firstRule.expr || data.query || '');
      const rawLabels = (firstRule.labels || data.labels || {}) as Record<string, string>;
      const rawAnnotations = (firstRule.annotations || data.annotations || {}) as Record<
        string,
        string
      >;

      // Duration fields: prefer the summary-level fields which are already
      // formatted as duration strings by the server's rule mapper.
      // Normalize "120s" → "2m" etc. so the dropdown can match.
      const rawFor = data.pendingPeriod ?? (firstRule.for != null ? String(firstRule.for) : '') || '5m';
      const forDuration = normalizeDuration(rawFor);
      const evaluationInterval = normalizeDuration(data.evaluationInterval || '1m');
      const firingPeriod = normalizeDuration(data.firingPeriod || forDuration);

      const promForm: import('./create_monitor_types').PrometheusFormState = {
        name: data.name,
        datasourceId: data.datasourceId,
        datasourceType: 'prometheus',
        query: expr.replace(/\s*(>|>=|<|<=|==|!=)\s*[\d.]+\s*$/, '').trim() || expr,
        threshold: {
          operator: (data.threshold?.operator as '>' | '>=' | '<' | '<=' | '==' | '!=') || '>',
          value: data.threshold?.value ?? 0,
          unit: data.threshold?.unit || '',
          forDuration,
        },
        evaluationInterval,
        pendingPeriod: forDuration,
        firingPeriod,
        labels: Object.entries(rawLabels).map(([key, value]) => ({ key, value })),
        annotations: Object.entries(rawAnnotations).map(([key, value]) => ({ key, value })),
        severity: data.severity,
        enabled: data.enabled,
      };
      setSeededForm(promForm);
      return;
    }
    if (data.datasourceType !== 'opensearch') {
      setUnsupported('Editing this monitor type is not supported yet.');
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
            <h2 id="editMonitorErrorTitle">
              <FormattedMessage
                id="observability.alerting.editMonitor.failedToLoadTitle"
                defaultMessage="Failed to load rule"
              />
            </h2>
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
            <h2 id="editMonitorUnsupportedTitle">
              <FormattedMessage
                id="observability.alerting.editMonitor.unsupportedTitle"
                defaultMessage="Edit not supported"
              />
            </h2>
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
      isNameTaken={isNameTaken}
      submitError={submitError}
      onClearPplSubmitError={onClearPplSubmitError}
    />
  );
};
