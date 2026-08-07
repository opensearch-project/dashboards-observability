/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo } from 'react';
import {
  EuiCallOut,
  EuiCode,
  EuiComboBox,
  EuiFormRow,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { usePrometheusDataSources } from '../../shared/hooks/use_apm_config';
import { RequirementCallout } from '../components/requirement_callout';
import {
  usePrometheusMetricCheck,
  PrometheusCandidate,
} from '../hooks/use_prometheus_metric_check';
import { APM_RED_REQUIRED_METRICS } from '../constants';
import { APM_RED_METRICS_DOCS_URL } from '../../common/constants';
import { StepState } from '../types';

export interface MetricsStepProps {
  state: StepState;
  onStateChange: (state: StepState) => void;
  onPrometheusDataSourceIdChange: (id: string) => void;
}

/**
 * Page 4 — RED metrics. Enumerates existing direct-query Prometheus data
 * sources, checks each for the required RED metrics, and lets the user pick one
 * that matches. Never creates a data source.
 */
export const MetricsStep = ({
  state,
  onStateChange,
  onPrometheusDataSourceIdChange,
}: MetricsStepProps) => {
  const { data: prometheusDataSources, loading: prometheusLoading } = usePrometheusDataSources();

  const candidates: PrometheusCandidate[] = useMemo(
    () =>
      prometheusDataSources
        .map((option) => option.value)
        .filter((value): value is { id: string; name: string } => !!value?.id && !!value?.name),
    [prometheusDataSources]
  );

  const { results, loading: checkLoading } = usePrometheusMetricCheck(candidates);

  const matching = useMemo(() => results.filter((r) => r.matches), [results]);

  const isBusy = prometheusLoading || checkLoading;

  // Reconcile step status; auto-select when exactly one data source matches.
  useEffect(() => {
    if (isBusy) {
      onStateChange({ status: 'checking' });
      return;
    }

    if (matching.length === 0) {
      onStateChange({ status: 'missing' });
      onPrometheusDataSourceIdChange('');
      return;
    }

    if (matching.length === 1 && state.existingId !== matching[0].id) {
      onPrometheusDataSourceIdChange(matching[0].id);
      onStateChange({ status: 'exists', existingId: matching[0].id, detail: matching[0].name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBusy, matching]);

  const handleSelect = (id: string) => {
    const chosen = matching.find((m) => m.id === id);
    onPrometheusDataSourceIdChange(id);
    onStateChange({ status: 'exists', existingId: id, detail: chosen?.name });
  };

  return (
    <div data-test-subj="apmSetupWizardMetricsStep">
      <EuiText>
        <h3>
          {i18n.translate('observability.apm.setupWizard.metrics.heading', {
            defaultMessage: 'RED metrics',
          })}
        </h3>
        <p>
          {i18n.translate('observability.apm.setupWizard.metrics.description', {
            defaultMessage:
              'RED metrics (Rate, Errors, Duration) come from a Prometheus data source. The wizard checks your existing direct-query data sources and lists the ones exposing the required metrics.',
          })}
        </p>
      </EuiText>

      <EuiSpacer size="m" />

      <RequirementCallout
        title={i18n.translate('observability.apm.setupWizard.metrics.requirementTitle', {
          defaultMessage: 'RED metrics requirements',
        })}
        requiredFields={APM_RED_REQUIRED_METRICS}
        docsUrl={APM_RED_METRICS_DOCS_URL}
      >
        <p>
          {i18n.translate('observability.apm.setupWizard.metrics.requirementBody', {
            defaultMessage:
              'A Prometheus data source must expose these span-derived metrics to qualify.',
          })}
        </p>
      </RequirementCallout>

      <EuiSpacer size="m" />

      {isBusy ? (
        <EuiText size="s" color="subdued">
          <EuiLoadingSpinner size="m" />{' '}
          {i18n.translate('observability.apm.setupWizard.metrics.checking', {
            defaultMessage: 'Checking Prometheus data sources for RED metrics…',
          })}
        </EuiText>
      ) : matching.length > 0 ? (
        <>
          <EuiCallOut
            title={i18n.translate('observability.apm.setupWizard.metrics.foundTitle', {
              defaultMessage:
                '{count, plural, one {# data source has} other {# data sources have}} the required metrics',
              values: { count: matching.length },
            })}
            color="success"
            iconType="check"
            size="s"
          />
          <EuiSpacer size="m" />
          <EuiFormRow
            label={i18n.translate('observability.apm.setupWizard.metrics.selectLabel', {
              defaultMessage: 'Prometheus data source',
            })}
            fullWidth
          >
            <EuiComboBox
              compressed
              fullWidth
              singleSelection={{ asPlainText: true }}
              isClearable={false}
              options={matching.map((m) => ({ label: m.name, value: m.id }))}
              selectedOptions={matching
                .filter((m) => m.id === state.existingId)
                .map((m) => ({ label: m.name, value: m.id }))}
              onChange={(selected) => {
                const id = selected[0]?.value;
                if (id) {
                  handleSelect(id);
                }
              }}
              data-test-subj="apmSetupWizardMetricsPicker"
            />
          </EuiFormRow>
        </>
      ) : (
        <EuiCallOut
          title={i18n.translate('observability.apm.setupWizard.metrics.noneTitle', {
            defaultMessage: 'No matching Prometheus data source',
          })}
          color="warning"
          iconType="alert"
          size="s"
          data-test-subj="apmSetupWizardMetricsNone"
        >
          <p>
            {i18n.translate('observability.apm.setupWizard.metrics.noneText', {
              defaultMessage:
                'None of your direct-query data sources expose all required RED metrics ({metrics}). Create or configure a Prometheus data source with these metrics, then reopen the wizard.',
              values: { metrics: APM_RED_REQUIRED_METRICS.join(', ') },
            })}
          </p>
          {results.length > 0 && (
            <EuiText size="xs">
              {results.map((r) => (
                <p key={r.id}>
                  <EuiCode>{r.name}</EuiCode>{' '}
                  {i18n.translate('observability.apm.setupWizard.metrics.missingList', {
                    defaultMessage: 'missing: {missing}',
                    values: { missing: r.missing.join(', ') || '—' },
                  })}
                </p>
              ))}
            </EuiText>
          )}
        </EuiCallOut>
      )}
    </div>
  );
};
