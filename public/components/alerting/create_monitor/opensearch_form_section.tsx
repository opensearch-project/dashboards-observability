/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenSearch form section of the Create Monitor flyout. Authors PPL monitors
 * only — DSL / cluster-metrics monitors are read-only in the Rules table.
 *
 * Split out of the original `create_monitor.tsx` so the flyout shell in
 * `index.tsx` stays focused on orchestration + shared form fields.
 */
import React, { useCallback } from 'react';
import {
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { OpenSearchFormState, OS_SCHEDULE_UNIT_OPTIONS } from './create_monitor_types';
import { IndexPicker } from './sections/index_picker';
import { PplQueryEditor } from './sections/ppl_query_editor';
import { PplTriggersSection } from './sections/ppl_triggers';
import { TimeFieldSelector } from './sections/time_field_selector';

// Rewrite the leading `source = ...` clause to reflect the picker's index
// list, preserving the rest of the query (everything from the first `|`
// onward). When the query is empty we fall back to a starter template so
// the user has something to edit; when the picker is empty we strip the
// source clause but keep the body so the user doesn't lose work.
const SOURCE_LINE_RE = /^\s*source\s*=\s*[^|\n]*/i;

function defaultPplQueryFor(indices: string[]): string {
  if (indices.length === 0) return '';
  return `source = ${indices.join(', ')}\n| stats count() as error_count`;
}

function rewriteSourceClause(query: string, indices: string[]): string {
  const trimmed = query.trim();
  if (!trimmed) return defaultPplQueryFor(indices);

  if (SOURCE_LINE_RE.test(trimmed)) {
    if (indices.length === 0) {
      // Drop the source clause; keep the body so the user doesn't lose work.
      const stripped = trimmed.replace(SOURCE_LINE_RE, '').replace(/^\s*\|\s*/, '');
      return stripped;
    }
    return trimmed.replace(SOURCE_LINE_RE, `source = ${indices.join(', ')}`);
  }

  // No leading source clause yet — prepend one if we have indices.
  if (indices.length === 0) return query;
  return `source = ${indices.join(', ')}\n${trimmed.startsWith('|') ? '' : '| '}${trimmed}`;
}

// ============================================================================
// OpenSearch Form Section
// ============================================================================

export const OpenSearchFormSection: React.FC<{
  form: OpenSearchFormState;
  onUpdate: <K extends keyof OpenSearchFormState>(key: K, value: OpenSearchFormState[K]) => void;
  validationErrors: Record<string, string>;
  hasSubmitted: boolean;
}> = ({ form, onUpdate, validationErrors, hasSubmitted }) => {
  // Rewrite the leading `source = ...` clause whenever the picker changes,
  // preserving any later pipes the user has authored. Prevents stranding
  // the user with `source = old-index | ...` after they swap indices.
  const handleIndicesChange = useCallback(
    (next: string[]) => {
      onUpdate('indices', next);
      onUpdate('query', rewriteSourceClause(form.query, next));
      // Clear timeField if the user dropped all indices — the field choices
      // are now empty and a stale value would surface invalid validation.
      if (next.length === 0 && form.timeField) {
        onUpdate('timeField', '');
      }
    },
    [form.query, form.timeField, onUpdate]
  );

  return (
    <>
      {/* Define index — picker + timestamp field. Mirrors the alerting plugin's
          "Define monitor → Data source" step. */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('observability.alerting.opensearchFormSection.defineIndexTitle', {
              defaultMessage: 'Define index',
            })}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <IndexPicker
          dsId={form.datasourceId}
          selected={form.indices}
          onChange={handleIndicesChange}
          isInvalid={hasSubmitted && !!validationErrors.indices}
          error={hasSubmitted ? validationErrors.indices : undefined}
        />
        <EuiSpacer size="s" />
        <TimeFieldSelector
          dsId={form.datasourceId}
          indices={form.indices}
          value={form.timeField}
          onChange={(v) => onUpdate('timeField', v)}
          isInvalid={hasSubmitted && !!validationErrors.timeField}
          error={hasSubmitted ? validationErrors.timeField : undefined}
        />
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* PPL Query — Monaco-backed editor with field-aware autocomplete. */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('observability.alerting.opensearchFormSection.queryTitle', {
              defaultMessage: 'Query',
            })}
          </h3>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          {i18n.translate('observability.alerting.opensearchFormSection.queryDescriptionPpl', {
            defaultMessage:
              'Piped Processing Language. Press Ctrl+Space for field, command, and function suggestions.',
          })}
        </EuiText>
        <EuiSpacer size="s" />
        <PplQueryEditor
          dsId={form.datasourceId}
          indices={form.indices}
          value={form.query}
          onChange={(v) => onUpdate('query', v)}
        />
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued">
          <FormattedMessage
            id="observability.alerting.opensearchFormSection.pplExample"
            defaultMessage="Example: {example}"
            values={{
              example: (
                <code>
                  source = my-index | where status.code = 2 | stats count() as error_count by
                  serviceName
                </code>
              ),
            }}
          />
        </EuiText>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* Schedule */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('observability.alerting.opensearchFormSection.scheduleTitle', {
              defaultMessage: 'Schedule',
            })}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem>
            <EuiFormRow
              label={i18n.translate('observability.alerting.opensearchFormSection.runEveryLabel', {
                defaultMessage: 'Run every',
              })}
              display="rowCompressed"
            >
              <EuiFieldNumber
                value={form.schedule.interval}
                onChange={(e) =>
                  onUpdate('schedule', {
                    ...form.schedule,
                    interval: parseInt(e.target.value, 10) || 1,
                  })
                }
                min={1}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.opensearchFormSection.scheduleIntervalAriaLabel',
                  { defaultMessage: 'Schedule interval' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.opensearchFormSection.scheduleUnitLabel',
                { defaultMessage: 'Unit' }
              )}
              display="rowCompressed"
            >
              <EuiSelect
                options={OS_SCHEDULE_UNIT_OPTIONS}
                value={form.schedule.unit}
                onChange={(e) =>
                  onUpdate('schedule', {
                    ...form.schedule,
                    unit: e.target.value as OpenSearchFormState['schedule']['unit'],
                  })
                }
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.opensearchFormSection.scheduleUnitAriaLabel',
                  { defaultMessage: 'Schedule unit' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="m" />

      {/* PPL trigger list — multi-trigger editor with destination picker per action */}
      <EuiPanel paddingSize="m" color="subdued">
        <PplTriggersSection
          dsId={form.datasourceId}
          triggers={form.pplTriggers}
          onChange={(next) => onUpdate('pplTriggers', next)}
          hasSubmitted={hasSubmitted}
        />
      </EuiPanel>
    </>
  );
};
