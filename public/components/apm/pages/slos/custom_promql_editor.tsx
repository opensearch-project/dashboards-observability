/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLI query editor. Only rendered on the `custom` template. Mirrors Grafana's
 * two SLI query types:
 *
 *   Ratio    → Success metric + Total metric. Each is a single metric picker
 *              (`MetricPicker`); the generator derives the error ratio as
 *              `1 - (success / total)`. The `sum(rate(...[5m]))` wrap is
 *              implicit, so the common case needs no PromQL. (Stored as the
 *              `events` customExpr mode — goodQuery/totalQuery.)
 *   Advanced → a single raw PromQL error-ratio query for power users.
 *              (Stored as the `raw` customExpr mode — errorRatioQuery.)
 *
 * The Ratio metric pickers parse/serialize via the structured `PromQLModel`.
 * If an existing goodQuery/totalQuery is too complex for the picker to
 * represent, that field shows a raw textarea instead so the query is never
 * silently rewritten.
 */

import React, { useRef, useState } from 'react';
import {
  EuiAccordion,
  EuiButtonGroup,
  EuiCallOut,
  EuiCode,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextArea,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  DEFAULT_MODEL,
  parsePromQL,
  serializePromQL,
  PromQLModel,
} from '../../../../../common/slo/promql_builder';
import { MetricPicker } from './metric_picker';
import type { SloTemplate } from '../../../../../common/slo/slo_templates';
import { substituteCustomPromqlDefaults } from '../../../../../common/slo/slo_templates';
import type { Action, FormState } from './wizard_state';

export interface CustomPromqlEditorProps {
  value: FormState['customPromql'];
  errors: Record<string, string>;
  dispatch: React.Dispatch<Action>;
  /** Datasource for metric/label autocomplete. Empty disables it (free text). */
  datasourceId: string;
  /** The active template — drives the simple-view summary + "is this the default" check. */
  template: SloTemplate;
  /** The selected service, plugged into the summary line. */
  service: string;
  /**
   * Optional "test this query" control rendered directly under the query
   * summary, so verifying the SLI lives with the query itself. The wizard
   * passes an embedded ProbeSliPanel.
   */
  probeSlot?: React.ReactNode;
}

/**
 * True when the current query still equals the template's default for the given
 * service — i.e. the user hasn't hand-edited it. When so, the simple summary
 * view is enough; otherwise we auto-open Advanced so the edits stay visible.
 */
function isTemplateDefault(
  template: SloTemplate,
  value: FormState['customPromql'],
  service: string
): boolean {
  if (!template.customPromqlDefaults) return false;
  const def = substituteCustomPromqlDefaults(template.customPromqlDefaults, { service });
  if (value.mode !== def.mode) return false;
  if (def.mode === 'events') {
    return value.goodQuery === def.goodQuery && value.totalQuery === def.totalQuery;
  }
  return value.errorRatioQuery === def.errorRatioQuery;
}

const MODE_OPTIONS = [
  {
    id: 'events',
    label: i18n.translate('observability.apm.slo.wizard.customPromql.modeRatio', {
      defaultMessage: 'Ratio',
    }),
    iconType: 'percent',
  },
  {
    id: 'raw',
    label: i18n.translate('observability.apm.slo.wizard.customPromql.modeAdvanced', {
      defaultMessage: 'Advanced',
    }),
    iconType: 'editorCodeBlock',
  },
];

const MONO_STYLE: React.CSSProperties = { fontFamily: 'monospace' };

/**
 * A Ratio metric field — `MetricPicker` when the query is representable as a
 * single `sum(rate(metric{...}[5m]))`, else a raw textarea fallback so a
 * hand-tuned query isn't clobbered. No per-field mode toggle: the picker is
 * the default and the fallback is automatic.
 */
interface RatioMetricFieldProps {
  label: string;
  helpText: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  isInvalid: boolean;
  error?: string;
  datasourceId: string;
  testSubj: string;
}

const RatioMetricField: React.FC<RatioMetricFieldProps> = ({
  label,
  helpText,
  placeholder,
  value,
  onChange,
  isInvalid,
  error,
  datasourceId,
  testSubj,
}) => {
  // The structured model is local state, not re-derived from `value` each
  // render — otherwise an in-progress edit that serializes to '' (e.g. adding
  // a label filter before the metric is chosen) would be wiped on re-render.
  // We seed from the incoming value once; a parse failure means the stored
  // query is hand-written beyond the picker's shape, so fall back to raw text.
  const [model, setModel] = useState<PromQLModel | null>(() =>
    value ? parsePromQL(value) : DEFAULT_MODEL
  );
  // If the external value changes to something we can't model (e.g. switching
  // back from Advanced), drop to the textarea. Tracked via a ref so we only
  // react to genuine external changes, not our own serialized writes.
  const lastEmittedRef = useRef(value);

  const onModelChange = (next: PromQLModel) => {
    setModel(next);
    const serialized = serializePromQL(next);
    lastEmittedRef.current = serialized;
    onChange(serialized);
  };

  // External value diverged from what we last emitted → re-seed the model.
  if (value !== lastEmittedRef.current) {
    lastEmittedRef.current = value;
    setModel(value ? parsePromQL(value) : DEFAULT_MODEL);
  }

  return (
    <EuiFormRow label={label} isInvalid={isInvalid} error={error} helpText={helpText} fullWidth>
      {model ? (
        <MetricPicker
          model={model}
          onChange={onModelChange}
          datasourceId={datasourceId}
          data-test-subj={`${testSubj}Picker`}
        />
      ) : (
        // The stored query is hand-written beyond the picker's shape — keep it
        // editable as raw PromQL rather than discarding it.
        <EuiTextArea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={MONO_STYLE}
          fullWidth
          placeholder={placeholder}
          data-test-subj={testSubj}
        />
      )}
    </EuiFormRow>
  );
};

/** Plain-language description of what the template measures, for the summary. */
function summaryText(template: SloTemplate, service: string): string {
  const svc =
    service ||
    i18n.translate('observability.apm.slo.wizard.customPromql.thisService', {
      defaultMessage: 'this service',
    });
  if (template.sli.type === 'latency_threshold' || /latency/i.test(template.id)) {
    return i18n.translate('observability.apm.slo.wizard.customPromql.summaryLatency', {
      defaultMessage: 'Fraction of {service} requests completing under the latency bound.',
      values: { service: svc },
    });
  }
  return i18n.translate('observability.apm.slo.wizard.customPromql.summaryAvailability', {
    defaultMessage: 'Successful (non-fault) request ratio for {service}.',
    values: { service: svc },
  });
}

export const CustomPromqlEditor: React.FC<CustomPromqlEditorProps> = ({
  value,
  errors,
  dispatch,
  datasourceId,
  template,
  service,
  probeSlot,
}) => {
  const goodError = errors['spec.sli.definition.customExpr.goodQuery'];
  const totalError = errors['spec.sli.definition.customExpr.totalQuery'];
  const rawError = errors['spec.sli.definition.customExpr.errorRatioQuery'];
  const anyCustomExprError = errors['spec.sli.definition.customExpr'];

  // The current effective query (what will deploy), for the read-only summary.
  const summaryQuery =
    value.mode === 'events'
      ? value.goodQuery && value.totalQuery
        ? `(${value.goodQuery}) / (${value.totalQuery})`
        : value.goodQuery || value.totalQuery
      : value.errorRatioQuery;

  // Default to the simple view when the query is still the template default.
  // If the user already customized it, open Advanced so their edits are visible.
  const onTemplateDefault = isTemplateDefault(template, value, service);
  const [advancedOpen, setAdvancedOpen] = useState(!onTemplateDefault);
  const hasErrors = !!(goodError || totalError || rawError || anyCustomExprError);

  return (
    <EuiPanel data-test-subj="slosWizardCustomPromql">
      <EuiText size="m">
        <h4>
          {i18n.translate('observability.apm.slo.wizard.customPromql.heading', {
            defaultMessage: 'SLI query',
          })}
        </h4>
      </EuiText>

      {/* Simple view: plain-language summary + read-only generated query. The
          query tracks the selected service automatically (see wizard_state's
          service re-derivation); most users never need to open Advanced. */}
      <EuiSpacer size="s" />
      <EuiText size="s" data-test-subj="slosWizardSliSummary">
        {summaryText(template, service)}
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.apm.slo.wizard.customPromql.summaryQueryLabel', {
          defaultMessage: 'Query:',
        })}{' '}
        <EuiCode data-test-subj="slosWizardSliSummaryQuery">
          {summaryQuery ||
            i18n.translate('observability.apm.slo.wizard.customPromql.summaryQueryEmpty', {
              defaultMessage: 'select a service to build the query',
            })}
        </EuiCode>
      </EuiText>

      <EuiSpacer size="m" />
      <EuiAccordion
        id="slosWizardSliAdvanced"
        forceState={advancedOpen ? 'open' : 'closed'}
        onToggle={(isOpen) => setAdvancedOpen(isOpen)}
        buttonContent={i18n.translate('observability.apm.slo.wizard.customPromql.advancedToggle', {
          defaultMessage: 'Advanced — edit the SLI query',
        })}
        data-test-subj="slosWizardSliAdvanced"
        // Surface that there's something to look at when validation failed.
        extraAction={
          hasErrors ? (
            <EuiText size="xs" color="danger" data-test-subj="slosWizardSliAdvancedErrorHint">
              {i18n.translate('observability.apm.slo.wizard.customPromql.advancedErrorHint', {
                defaultMessage: 'Needs attention',
              })}
            </EuiText>
          ) : undefined
        }
      >
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          {i18n.translate('observability.apm.slo.wizard.customPromql.description', {
            defaultMessage:
              'Ratio builds the SLI from a success and a total metric — no PromQL needed. Advanced takes a raw error-ratio query. The preview below shows the exact rules that will be deployed.',
          })}
        </EuiText>
        <EuiSpacer size="s" />
        <EuiButtonGroup
          legend={i18n.translate('observability.apm.slo.wizard.customPromql.modeLegend', {
            defaultMessage: 'SLI query type',
          })}
          idSelected={value.mode}
          onChange={(id) =>
            dispatch({
              kind: 'setCustomPromql',
              patch: { mode: id === 'raw' ? 'raw' : 'events' },
            })
          }
          options={MODE_OPTIONS}
          data-test-subj="slosWizardCustomPromqlMode"
        />
        <EuiSpacer size="m" />
        {anyCustomExprError && (
          <>
            <EuiCallOut
              color="warning"
              size="s"
              title={anyCustomExprError}
              data-test-subj="slosWizardCustomPromqlMissing"
            />
            <EuiSpacer size="s" />
          </>
        )}
        {value.mode === 'events' ? (
          <>
            <RatioMetricField
              label={i18n.translate('observability.apm.slo.wizard.customPromql.successLabel', {
                defaultMessage: 'Success metric',
              })}
              helpText={i18n.translate('observability.apm.slo.wizard.customPromql.successHelp', {
                defaultMessage:
                  'Counter of successful (good) events. Rate + sum are applied for you.',
              })}
              placeholder={`sum(rate(http_requests_total{status_code!~"5.."}[5m]))`}
              value={value.goodQuery}
              onChange={(next) => dispatch({ kind: 'setCustomPromql', patch: { goodQuery: next } })}
              isInvalid={!!goodError}
              error={goodError}
              datasourceId={datasourceId}
              testSubj="slosWizardCustomPromqlGood"
            />
            <RatioMetricField
              label={i18n.translate('observability.apm.slo.wizard.customPromql.totalLabel', {
                defaultMessage: 'Total metric',
              })}
              helpText={i18n.translate('observability.apm.slo.wizard.customPromql.totalHelp', {
                defaultMessage: 'Counter of all events. Rate + sum are applied for you.',
              })}
              placeholder={`sum(rate(http_requests_total[5m]))`}
              value={value.totalQuery}
              onChange={(next) =>
                dispatch({ kind: 'setCustomPromql', patch: { totalQuery: next } })
              }
              isInvalid={!!totalError}
              error={totalError}
              datasourceId={datasourceId}
              testSubj="slosWizardCustomPromqlTotal"
            />
          </>
        ) : (
          <EuiFormRow
            label={i18n.translate('observability.apm.slo.wizard.customPromql.rawLabel', {
              defaultMessage: 'Error-ratio query',
            })}
            isInvalid={!!rawError}
            error={rawError}
            helpText={i18n.translate('observability.apm.slo.wizard.customPromql.rawHelp', {
              defaultMessage: 'Raw PromQL returning a pre-computed error ratio in [0, 1].',
            })}
            fullWidth
          >
            <EuiTextArea
              rows={3}
              value={value.errorRatioQuery}
              onChange={(e) =>
                dispatch({ kind: 'setCustomPromql', patch: { errorRatioQuery: e.target.value } })
              }
              style={MONO_STYLE}
              fullWidth
              placeholder={`(sum(rate(errors[5m])) / sum(rate(requests[5m])))`}
              data-test-subj="slosWizardCustomPromqlRaw"
            />
          </EuiFormRow>
        )}
      </EuiAccordion>

      {probeSlot && (
        <>
          <EuiSpacer size="m" />
          {probeSlot}
        </>
      )}
    </EuiPanel>
  );
};
