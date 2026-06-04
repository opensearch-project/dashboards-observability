/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Run preview" affordance below the PPL editor in the Create Monitor flyout.
 * Lets the user validate that the query parses, runs against the chosen
 * datasource, and returns rows — *before* committing to a monitor.
 *
 * Renders a single button until the user clicks; afterward shows a compact
 * panel with row count, server-reported duration, and the first few rows
 * (or a friendly error). The panel is purely advisory — no save side
 * effects.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSmallButton,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  PplPreviewResult,
  PPL_PREVIEW_MAX_ROWS,
  orderSchemaForPreview,
  runPplPreview,
} from './ppl_preview';

// Visible column cap. Lower than the schema's true width keeps the
// preview legible inside the flyout; hidden-column count is surfaced
// just below the table.
const MAX_PREVIEW_COLUMNS = 5;

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export interface PplPreviewPanelProps {
  query: string;
  /** Resolved MDS saved-object id; empty/undefined targets the local cluster. */
  mdsId?: string;
  /** True when no datasource is selected — the button is disabled. */
  hasDatasource: boolean;
}

export const PplPreviewPanel: React.FC<PplPreviewPanelProps> = ({
  query,
  mdsId,
  hasDatasource,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PplPreviewResult | null>(null);

  // Race-condition guards. `runIdRef` is bumped per Run click so a
  // late-arriving response from a stale request can detect it has been
  // superseded and skip the `setResult`. `mountedRef` flips on unmount
  // so a request still in flight when the parent flyout closes doesn't
  // call setState on this unmounted component (React warns about that).
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  // Reset cached results when the query or target datasource changes —
  // otherwise the user could see "✓ Returned 21 rows" while the editor
  // shows a substantially different (or now-broken) query, which is
  // misleading. The reset trigger is intentionally aggressive: any
  // keystroke clears the panel; users re-run preview to refresh.
  //
  // Bumping `runIdRef` here too means a request still in flight when the
  // user edits the query is invalidated, so its eventual response can't
  // overwrite the freshly-cleared state.
  useEffect(() => {
    runIdRef.current += 1;
    setResult(null);
  }, [query, mdsId]);

  const handleRun = async () => {
    const id = ++runIdRef.current;
    setLoading(true);
    const r = await runPplPreview({ query, mdsId });
    // Bail if a later Run has already started, the panel was unmounted,
    // or the user edited the query since this request was dispatched
    // (the reset effect bumped `result` to null and we don't want to
    // overwrite that with stale data).
    if (!mountedRef.current || runIdRef.current !== id) return;
    setResult(r);
    setLoading(false);
  };

  const canRun = hasDatasource && query.trim().length > 0 && !loading;

  return (
    <div data-test-subj="alertManagerPplPreview">
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiSmallButton
            iconType="play"
            isLoading={loading}
            isDisabled={!canRun}
            onClick={handleRun}
            data-test-subj="alertManagerPplPreviewRun"
          >
            {i18n.translate('observability.alerting.pplPreview.runButton', {
              defaultMessage: 'Run preview',
            })}
          </EuiSmallButton>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.alerting.pplPreview.helpText', {
              defaultMessage:
                'Validates that the query runs and returns rows. Does not save the monitor.',
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      {result && (
        <>
          <EuiSpacer size="s" />
          {result.ok ? (
            <PreviewSuccessPanel result={result} />
          ) : (
            <PreviewErrorPanel result={result} />
          )}
        </>
      )}
    </div>
  );
};

// ============================================================================
// Success panel — row count + first rows
// ============================================================================

const PreviewSuccessPanel: React.FC<{ result: Extract<PplPreviewResult, { ok: true }> }> = ({
  result,
}) => {
  const { total, tookMs, schema, rows } = result;

  const summary =
    tookMs !== undefined
      ? i18n.translate('observability.alerting.pplPreview.summaryWithTook', {
          defaultMessage: 'Returned {total} {total, plural, one {row} other {rows}} in {tookMs}ms',
          values: { total, tookMs },
        })
      : i18n.translate('observability.alerting.pplPreview.summary', {
          defaultMessage: 'Returned {total} {total, plural, one {row} other {rows}}',
          values: { total },
        });

  if (total === 0) {
    return (
      <EuiCallOut
        size="s"
        color="warning"
        iconType="alert"
        title={i18n.translate('observability.alerting.pplPreview.zeroRowsTitle', {
          defaultMessage: 'Query ran but returned 0 rows',
        })}
        data-test-subj="alertManagerPplPreviewZeroRows"
      >
        <p>
          {i18n.translate('observability.alerting.pplPreview.zeroRowsBody', {
            defaultMessage:
              'A monitor based on this query will not fire until rows match. Verify the indices, filters, and time scope.',
          })}
        </p>
      </EuiCallOut>
    );
  }

  // Order the schema so headline fields (time, body, severityText, service
  // name, traceId…) come first, then any fields the user is filtering on
  // in a `where` clause, then scalars, then complex types. Passing the
  // executed query lets the helper promote those `where` fields directly
  // after the timestamp.
  const orderedSchema = orderSchemaForPreview(schema, result.executedQuery);
  const visibleColumns = orderedSchema.slice(0, MAX_PREVIEW_COLUMNS);
  const hiddenColumnCount = Math.max(0, orderedSchema.length - visibleColumns.length);

  const tableColumns: Array<EuiBasicTableColumn<Record<string, unknown>>> = visibleColumns.map(
    (f) => ({
      field: f.name,
      name: (
        <EuiText size="xs">
          <strong>{f.name}</strong>
          <span className="altPplPreview__columnTypeTag"> · {f.type}</span>
        </EuiText>
      ),
      truncateText: true,
      render: (value: unknown) => {
        if (value === null || value === undefined) {
          return (
            <EuiText size="xs" className="altPplPreview__cell altPplPreview__cellNull">
              null
            </EuiText>
          );
        }
        const raw = stringifyValue(value);
        // CSS-driven truncation — `.altPplPreview__cell` clips with ellipsis
        // at the column boundary. The tooltip's anchor element is given
        // `.altPplPreview__anchor` so its default `inline-block` doesn't
        // let content spill past the column (otherwise the ellipsis on the
        // inner span never has a bounded ancestor to clip against).
        return (
          <EuiToolTip position="top" content={raw} anchorClassName="altPplPreview__anchor">
            <EuiText size="xs" className="altPplPreview__cell">
              {raw}
            </EuiText>
          </EuiToolTip>
        );
      },
    })
  );

  return (
    <EuiPanel
      paddingSize="s"
      hasBorder
      className="altPplPreview"
      data-test-subj="alertManagerPplPreviewSuccess"
    >
      <EuiText size="s">
        <strong>✓ {summary}</strong>
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.alerting.pplPreview.rowsShownNote', {
          defaultMessage:
            'Showing first {shown} of {total} {total, plural, one {row} other {rows}}.',
          values: { shown: Math.min(rows.length, PPL_PREVIEW_MAX_ROWS), total },
        })}
        {hiddenColumnCount > 0 &&
          ' ' +
            i18n.translate('observability.alerting.pplPreview.columnsHiddenNote', {
              defaultMessage: '{hidden} {hidden, plural, one {column} other {columns}} hidden.',
              values: { hidden: hiddenColumnCount },
            })}
      </EuiText>
      <EuiSpacer size="xs" />
      {/* CSS in `alerting.scss` (.altPplPreview rules) handles fixed-table
          layout, per-cell ellipsis, and the wrapper's overflow clipping —
          keeping the visual rules out of JSX so they're easier to spot and
          tweak alongside the rest of the alert-manager styles. */}
      <div className="altPplPreview__tableWrap">
        <EuiBasicTable
          items={rows}
          columns={tableColumns}
          compressed
          tableLayout="fixed"
          responsive={false}
          data-test-subj="alertManagerPplPreviewTable"
        />
      </div>
    </EuiPanel>
  );
};

// ============================================================================
// Error panel — friendly message + raw cluster message in details
// ============================================================================

const PreviewErrorPanel: React.FC<{ result: Extract<PplPreviewResult, { ok: false }> }> = ({
  result,
}) => {
  const showRaw = result.rawMessage && result.rawMessage !== result.message;
  return (
    <EuiCallOut
      size="s"
      color="danger"
      iconType="alert"
      title={result.message}
      data-test-subj="alertManagerPplPreviewError"
    >
      {showRaw && (
        <details>
          <summary>
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.alerting.pplPreview.rawDetailsToggle', {
                defaultMessage: 'Raw cluster response',
              })}
            </EuiText>
          </summary>
          <EuiText size="xs" color="subdued">
            <code>{result.rawMessage}</code>
          </EuiText>
        </details>
      )}
    </EuiCallOut>
  );
};
