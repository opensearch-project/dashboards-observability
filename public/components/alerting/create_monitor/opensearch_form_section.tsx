/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenSearch form section of the Create Monitor flyout. Authors PPL monitors
 * only — DSL / cluster-metrics monitors are read-only in the Rules table.
 *
 * The datasource, indices, and time-field selectors are rendered inline as a
 * compact toolbar above the Monaco PPL editor.
 */
import React, { useCallback, useMemo } from 'react';
import {
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLink,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { Datasource } from '../../../../common/types/alerting';
import { applyLookBackToQuery } from '../../../../common/services/alerting/ppl_lookback';
import { PPL_QUERY_MAX_LENGTH } from '../../../../common/services/alerting/validators';
import { coreRefs } from '../../../framework/core_refs';
import { OpenSearchFormState, OS_SCHEDULE_UNIT_OPTIONS } from './create_monitor_types';
import { PplLookbackEditor } from './sections/ppl_lookback_editor';
import { PplPreviewPanel } from './sections/ppl_preview_panel';
import { PplQueryEditor } from './sections/ppl_query_editor';
import { PplTriggersSection } from './sections/ppl_triggers';
import { QueryToolbar } from './sections/query_toolbar';
// Pull in the shared alert-manager stylesheet — owns `.altPplPreview` rules
// the preview panel depends on. Imported here (not just from alarms_page.tsx)
// because the Explore-launched flyout mounts this section without going
// through the Rules page, so without this import the bundle wouldn't include
// the SCSS when the user opens Create-from-Explore on a fresh page load.
import '../alerting.scss';

// Rewrite the leading `source = ...` clause to reflect the picker's index
// list, preserving the rest of the query (everything from the first `|`
// onward). When the query is empty we fall back to a starter template so
// the user has something to edit; when the picker is empty we strip the
// source clause but keep the body so the user doesn't lose work.
const SOURCE_LINE_RE = /^\s*source\s*=\s*[^|\n]*/i;

function defaultPplQueryFor(indices: string[]): string {
  if (indices.length === 0) return '';
  // Bare `source = …` so the seeded query is valid against every index
  // shape and works with the default `number_of_results >= 1` trigger
  // out of the box. Users add filters / stats from there.
  return `source = ${indices.join(', ')}`;
}

function rewriteSourceClause(query: string, indices: string[]): string {
  const trimmed = query.trim();
  if (!trimmed) return defaultPplQueryFor(indices);

  if (SOURCE_LINE_RE.test(trimmed)) {
    if (indices.length === 0) {
      const stripped = trimmed.replace(SOURCE_LINE_RE, '').replace(/^\s*\|\s*/, '');
      return stripped;
    }
    return trimmed.replace(SOURCE_LINE_RE, `source = ${indices.join(', ')}`);
  }

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
  /** Datasources of type 'opensearch' — drives the inline picker. */
  datasources: Datasource[];
  /** Switching datasources from the toolbar; ignored in edit mode. */
  onDatasourceChange: (id: string) => void;
  /** Edit mode pins the datasource. */
  isEdit?: boolean;
  /** Server-reported PPL parse error from a failed save; rendered under the editor. */
  pplServerError?: string;
  /**
   * Hide the "Build query in logs →" link in the Query panel header.
   * Set when the flyout is launched from the Logs page itself — the link
   * would otherwise be a circular round-trip back to where the user came
   * from (and lose their unsaved form state on the way).
   */
  hideBuildInLogsLink?: boolean;
}> = ({
  form,
  onUpdate,
  validationErrors: _validationErrors,
  hasSubmitted,
  datasources,
  onDatasourceChange,
  isEdit,
  pplServerError,
  hideBuildInLogsLink,
}) => {
  // Resolve the active datasource's MDS saved-object id once per render,
  // so the preview panel can scope its PPL call to the right cluster
  // without doing the lookup itself.
  const activeMdsId = useMemo(
    () => datasources.find((d) => d.id === form.datasourceId)?.mdsId,
    [datasources, form.datasourceId]
  );

  // Preview the effective query — with the look-back filter injected — so what
  // the user validates matches what the scheduled monitor will actually run.
  const previewQuery = useMemo(
    () =>
      applyLookBackToQuery(form.query, {
        useLookBackWindow: form.useLookBackWindow,
        lookBackAmount: form.lookBackAmount,
        lookBackUnit: form.lookBackUnit,
        lookbackTimestampField: form.timeField,
      }),
    [form.query, form.useLookBackWindow, form.lookBackAmount, form.lookBackUnit, form.timeField]
  );

  // Effective length = what actually persists after look-back injection. Shown
  // live as a non-blocking ADVISORY: the alerting backend enforces the real
  // query-length cap (a cluster may raise it beyond the 2000 default), so we
  // never block save on it — we just warn when the effective query passes the
  // default so long-query authors get a heads-up before the backend decides.
  const effectiveQueryLength = previewQuery.length;
  const overDefaultLimit = effectiveQueryLength > PPL_QUERY_MAX_LENGTH;
  // The look-back filter adds ~40 chars; note it when it's what pushed the
  // effective query past the default (the raw query fits on its own).
  const lookbackAddedLength = overDefaultLimit && form.query.length <= PPL_QUERY_MAX_LENGTH;

  // Send the user to the Explore Logs app, where they can author and
  // validate a PPL query against live data, then come back via the
  // Logs page Actions menu's "Create monitor" entry — which lands them
  // back here pre-filled. Same-tab navigation: in-progress form state in
  // this flyout will be lost; that's an acceptable tradeoff because the
  // intended use is "open empty flyout → click here → finish in Logs."
  // App id `explore/logs` matches `/app/explore/logs#/` — `navigateToApp`
  // resolves the basepath/workspace prefix on its own, so this works in
  // any environment.
  const openLogsApp = useCallback(() => {
    coreRefs?.application?.navigateToApp('explore/logs');
  }, []);

  // Rewrite the leading `source = ...` clause whenever the picker changes,
  // preserving any later pipes the user has authored. Prevents stranding
  // the user with `source = old-index | ...` after they swap indices.
  const handleIndicesChange = useCallback(
    (next: string[]) => {
      onUpdate('indices', next);
      onUpdate('query', rewriteSourceClause(form.query, next));
      if (next.length === 0 && form.timeField) {
        onUpdate('timeField', '');
      }
    },
    [form.query, form.timeField, onUpdate]
  );

  const handleLookbackUpdate = useCallback(
    (patch: {
      useLookBackWindow?: boolean;
      lookBackAmount?: number;
      lookBackUnit?: OpenSearchFormState['lookBackUnit'];
      timeField?: string;
    }) => {
      (Object.keys(patch) as Array<keyof typeof patch>).forEach((k) => {
        onUpdate(k as keyof OpenSearchFormState, patch[k] as never);
      });
    },
    [onUpdate]
  );

  return (
    <>
      {/* Query — toolbar (datasource / indices / time field) + Monaco editor.
          The header carries a "Build query in Logs" link on the right so
          users can iterate on a query against live data and round-trip back
          via the Logs page Actions menu. */}
      <EuiPanel paddingSize="m" color="subdued">
        <EuiFlexGroup
          alignItems="baseline"
          justifyContent="spaceBetween"
          gutterSize="s"
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('observability.alerting.opensearchFormSection.queryTitle', {
                  defaultMessage: 'Query',
                })}
              </h3>
            </EuiTitle>
          </EuiFlexItem>
          {!hideBuildInLogsLink && (
            <EuiFlexItem grow={false}>
              <EuiToolTip
                position="left"
                content={i18n.translate(
                  'observability.alerting.opensearchFormSection.openInLogsTooltip',
                  {
                    defaultMessage:
                      'Build and validate your query against live data in logs, then click Create alert rule to come back here pre-filled. Unsaved changes will be lost.',
                  }
                )}
              >
                <EuiLink onClick={openLogsApp} data-test-subj="alertManagerOpenInLogsLink">
                  {i18n.translate('observability.alerting.opensearchFormSection.openInLogs', {
                    defaultMessage: 'Build query in logs →',
                  })}
                </EuiLink>
              </EuiToolTip>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        <EuiSpacer size="s" />

        <QueryToolbar
          datasources={datasources}
          selectedDsId={form.datasourceId}
          onDatasourceChange={onDatasourceChange}
          datasourceLocked={isEdit}
          selectedIndices={form.indices}
          onIndicesChange={handleIndicesChange}
          selectedTimeField={form.timeField}
          onTimeFieldChange={(v) => onUpdate('timeField', v)}
        />

        <EuiSpacer size="s" />

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
          serverError={pplServerError}
        />
        <EuiSpacer size="xs" />
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="baseline" gutterSize="s">
          <EuiFlexItem grow={true}>
            <EuiText size="xs" color="subdued">
              <FormattedMessage
                id="observability.alerting.opensearchFormSection.pplExample"
                defaultMessage="Example: {example}"
                values={{
                  example: <code>source = my-index | where severityText = &apos;ERROR&apos;</code>,
                }}
              />
            </EuiText>
          </EuiFlexItem>
          {/* Live effective-length count (after look-back injection). Advisory
              only — turns warning past the default cap but never blocks save;
              the backend enforces the real, possibly-raised limit. */}
          <EuiFlexItem grow={false}>
            <EuiText
              size="xs"
              color={overDefaultLimit ? 'warning' : 'subdued'}
              data-test-subj="alertManagerPplQueryCharCount"
            >
              {i18n.translate('observability.alerting.opensearchFormSection.queryCharCount', {
                defaultMessage: '{len} characters',
                values: { len: effectiveQueryLength.toLocaleString() },
              })}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        {overDefaultLimit && (
          <>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="warning" data-test-subj="alertManagerPplQueryLengthAdvisory">
              {lookbackAddedLength
                ? i18n.translate('observability.alerting.opensearchFormSection.queryLongLookback', {
                    defaultMessage:
                      'With the look-back filter, the saved query is {len} characters. Clusters cap query length (default {max}); if yours rejects it, shorten the query or turn off the look-back window.',
                    values: {
                      len: effectiveQueryLength.toLocaleString(),
                      max: PPL_QUERY_MAX_LENGTH.toLocaleString(),
                    },
                  })
                : i18n.translate('observability.alerting.opensearchFormSection.queryLong', {
                    defaultMessage:
                      'This query is long ({len} characters). Clusters cap query length (default {max}); if yours rejects it on save, shorten the query.',
                    values: {
                      len: effectiveQueryLength.toLocaleString(),
                      max: PPL_QUERY_MAX_LENGTH.toLocaleString(),
                    },
                  })}
            </EuiText>
          </>
        )}
        <EuiSpacer size="m" />
        {/* Look-back window — part of the query: bounds each run to recent data
            by injecting a `where <Time field> > DATE_SUB(...)` filter. Anchored
            on the toolbar Time field above (no second time picker). */}
        <PplLookbackEditor
          dsId={form.datasourceId}
          indices={form.indices}
          useLookBackWindow={form.useLookBackWindow}
          lookBackAmount={form.lookBackAmount}
          lookBackUnit={form.lookBackUnit}
          timeField={form.timeField}
          query={form.query}
          onUpdate={handleLookbackUpdate}
        />
        <EuiSpacer size="s" />
        {/* Run-preview affordance — validates the query against the chosen
            datasource before save. Resets implicitly each click; we don't
            persist preview state with the form. */}
        <PplPreviewPanel
          query={previewQuery}
          mdsId={activeMdsId}
          hasDatasource={!!form.datasourceId}
        />
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
