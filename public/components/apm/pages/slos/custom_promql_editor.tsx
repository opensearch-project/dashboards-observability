/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom PromQL editor. Only rendered when the wizard is on the
 * `custom` template. Two modes:
 *
 *   events  → user supplies `goodQuery` + `totalQuery`; generator derives
 *             the error ratio as `1 - (goodQuery / totalQuery)`.
 *   raw     → user supplies a pre-computed error-ratio `errorRatioQuery`;
 *             generator uses it as-is (must already be in [0, 1]).
 *
 * Validation is `validateCustomPromQL` from `slo_validators.ts` (already
 * wired via `validateSloSpec`). The wizard surfaces the field-level errors
 * inline and the top-level summary picks them up via `WIZARD_SECTIONS`.
 *
 * OUI first: EuiTextArea with monospaced styling. A full Monaco/PromQL
 * editor is listed as a follow-up — OSD ships one, but wiring it adds a
 * cross-plugin dependency that this PR doesn't need.
 */

import React from 'react';
import {
  EuiButtonGroup,
  EuiCallOut,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextArea,
} from '@elastic/eui';
import type { Action, FormState } from './wizard_state';

export interface CustomPromqlEditorProps {
  value: FormState['customPromql'];
  errors: Record<string, string>;
  dispatch: React.Dispatch<Action>;
}

const MODE_OPTIONS = [
  { id: 'events', label: 'Events (good + total)' },
  { id: 'raw', label: 'Raw error-ratio' },
];

const MONO_STYLE: React.CSSProperties = { fontFamily: 'monospace' };

export const CustomPromqlEditor: React.FC<CustomPromqlEditorProps> = ({
  value,
  errors,
  dispatch,
}) => {
  const goodError = errors['spec.sli.definition.customExpr.goodQuery'];
  const totalError = errors['spec.sli.definition.customExpr.totalQuery'];
  const rawError = errors['spec.sli.definition.customExpr.errorRatioQuery'];
  const anyCustomExprError = errors['spec.sli.definition.customExpr'];

  return (
    <EuiPanel data-test-subj="slosWizardCustomPromql">
      <EuiText size="m">
        <h4>Custom PromQL</h4>
      </EuiText>
      <EuiText size="s" color="subdued">
        Supply your own PromQL. Preview below shows the exact rule group that will be deployed.
      </EuiText>
      <EuiSpacer size="s" />
      <EuiButtonGroup
        legend="PromQL mode"
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
      <EuiSpacer size="s" />
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
          <EuiFormRow
            label="Good events query"
            isInvalid={!!goodError}
            error={goodError}
            helpText="PromQL returning the count of good events (non-errors)."
            fullWidth
          >
            <EuiTextArea
              rows={3}
              value={value.goodQuery}
              onChange={(e) =>
                dispatch({ kind: 'setCustomPromql', patch: { goodQuery: e.target.value } })
              }
              style={MONO_STYLE}
              fullWidth
              placeholder={`sum(rate(http_requests_total{status_code!~"5.."}[5m]))`}
              data-test-subj="slosWizardCustomPromqlGood"
            />
          </EuiFormRow>
          <EuiFormRow
            label="Total events query"
            isInvalid={!!totalError}
            error={totalError}
            helpText="PromQL returning the count of total events."
            fullWidth
          >
            <EuiTextArea
              rows={3}
              value={value.totalQuery}
              onChange={(e) =>
                dispatch({ kind: 'setCustomPromql', patch: { totalQuery: e.target.value } })
              }
              style={MONO_STYLE}
              fullWidth
              placeholder={`sum(rate(http_requests_total[5m]))`}
              data-test-subj="slosWizardCustomPromqlTotal"
            />
          </EuiFormRow>
        </>
      ) : (
        <EuiFormRow
          label="Error-ratio query"
          isInvalid={!!rawError}
          error={rawError}
          helpText="PromQL returning a pre-computed error ratio in [0, 1]."
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
    </EuiPanel>
  );
};
