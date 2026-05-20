/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * W4.8 — Recover tab.
 *
 * Table of adoptable orphans. Each row exposes:
 *   - integrity badge (mandatory; recovery is disabled for non-'ok' rows)
 *   - tombstone badge with explicit confirmation modal when tombstoned
 *   - row expand with a read-only spec preview
 *   - Recover / Dismiss actions
 *
 * Dismiss is local-only — it does NOT call any server endpoint; rows stay
 * visible across page reloads unless the operator explicitly hides them.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInMemoryTable,
  EuiPanel,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import type { NotificationsStart } from '../../../../../../../../src/core/public';
import type {
  OrphanCandidate,
  OrphanListResponse,
  OrphanUnknown,
  SloApiClient,
} from '../slo_api_client';
import { OrphanIntegrityBadge } from './orphan_integrity_badge';
import { TombstoneBadge } from './tombstone_badge';
import { ReadOnlySpecPreview } from './read_only_spec_preview';

export interface RecoverTabProps {
  apiClient: SloApiClient;
  notifications: NotificationsStart;
  /** Pre-fetched orphan list from the page-level feature-flag gate. */
  initialData: OrphanListResponse | null;
}

/** Stable per-row identity — safe against sloId collisions across datasources. */
function rowKey(c: OrphanCandidate): string {
  return `${c.datasourceId}:${c.namespace}:${c.groupName}:${c.sloId}`;
}

/** Extract a server-reported error message from an OSD http error envelope. */
function errorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const body = (err as { body?: { message?: unknown; attributes?: { message?: unknown } } }).body;
  if (body) {
    if (typeof body.message === 'string') return body.message;
    if (body.attributes && typeof body.attributes.message === 'string') {
      return body.attributes.message;
    }
  }
  if ((err as Error).message) return (err as Error).message;
  return 'Request failed';
}

function isTombstonedConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const body = (err as { body?: { attributes?: { code?: unknown } } }).body;
  return body?.attributes?.code === 'ORPHAN_TOMBSTONED';
}

export const RecoverTab: React.FC<RecoverTabProps> = ({
  apiClient,
  notifications,
  initialData,
}) => {
  const [candidates, setCandidates] = useState<OrphanCandidate[]>(initialData?.candidates ?? []);
  const [unknowns, setUnknowns] = useState<OrphanUnknown[]>(initialData?.unknowns ?? []);
  const [loading, setLoading] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [itemIdToExpandedRowMap, setItemIdToExpandedRowMap] = useState<
    Record<string, React.ReactNode>
  >({});
  /** Rows currently waiting on a server recover call — button disabled in-flight. */
  const [inFlight, setInFlight] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setRefreshError(null);
    try {
      const data = await apiClient.listOrphans();
      setCandidates(data.candidates);
      setUnknowns(data.unknowns);
    } catch (err) {
      setRefreshError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  const toggleExpand = useCallback((c: OrphanCandidate) => {
    const key = rowKey(c);
    setItemIdToExpandedRowMap((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = (
          <div data-test-subj={`sloAdoption-recoverTab-expanded-${c.sloId}`}>
            <ReadOnlySpecPreview spec={c.spec} fingerprints={c.fingerprints} />
          </div>
        );
      }
      return next;
    });
  }, []);

  const performRecover = useCallback(
    async (c: OrphanCandidate, acknowledgeTombstone: boolean) => {
      const key = rowKey(c);
      setInFlight((prev) => new Set(prev).add(key));
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        await apiClient.recoverSlo({
          sloId: c.sloId,
          datasourceId: c.datasourceId,
          workspaceId: c.workspaceId,
          acknowledgeTombstone: acknowledgeTombstone || undefined,
        });
        notifications.toasts.addSuccess({
          title: 'SLO recovered',
          text: `${c.spec?.name ?? c.sloId} is now managed again.`,
        });
        setCandidates((prev) => prev.filter((x) => rowKey(x) !== key));
      } catch (err) {
        if (!acknowledgeTombstone && isTombstonedConflict(err)) {
          // Defence-in-depth: server says "tombstoned" even though the row
          // didn't flag it. Fall back to the badge's modal flow so the
          // operator still has to click through.
          setCandidates((prev) =>
            prev.map((x) =>
              rowKey(x) === key
                ? { ...x, tombstoned: true, tombstoneCreatedAt: x.tombstoneCreatedAt }
                : x
            )
          );
        }
        setRowErrors((prev) => ({ ...prev, [key]: errorMessage(err) }));
      } finally {
        setInFlight((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [apiClient, notifications.toasts]
  );

  const dismissRow = useCallback((c: OrphanCandidate) => {
    const key = rowKey(c);
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const visibleCandidates = useMemo(() => {
    if (showDismissed) return candidates;
    return candidates.filter((c) => !dismissed.has(rowKey(c)));
  }, [candidates, dismissed, showDismissed]);

  const columns = useMemo<Array<EuiBasicTableColumn<OrphanCandidate>>>(
    () => [
      {
        name: 'SLO name',
        render: (c: OrphanCandidate) => (
          <EuiText size="s" data-test-subj={`sloAdoption-recoverTab-name-${c.sloId}`}>
            <strong>{c.spec?.name ?? c.sloId}</strong>
          </EuiText>
        ),
      },
      {
        name: 'Status',
        render: (c: OrphanCandidate) => (
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <OrphanIntegrityBadge integrity={c.specIntegrity} testSubjSuffix={c.sloId} />
            </EuiFlexItem>
            {c.tombstoned ? (
              <EuiFlexItem grow={false}>
                <TombstoneBadge
                  createdAt={c.tombstoneCreatedAt}
                  onConfirm={() => performRecover(c, true)}
                  disabled={c.specIntegrity !== 'ok' || inFlight.has(rowKey(c))}
                  testSubjSuffix={c.sloId}
                />
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        ),
      },
      {
        name: 'Datasource',
        render: (c: OrphanCandidate) => <EuiText size="s">{c.datasourceId}</EuiText>,
      },
      {
        name: 'Fingerprints',
        render: (c: OrphanCandidate) => (
          <EuiText size="s">{c.fingerprints.length} recording groups</EuiText>
        ),
      },
      {
        name: 'Actions',
        render: (c: OrphanCandidate) => {
          const key = rowKey(c);
          const integrityBlock = c.specIntegrity !== 'ok';
          const busy = inFlight.has(key);
          const recoverButton = (
            <EuiButton
              size="s"
              fill
              data-test-subj={`sloAdoption-recoverTab-recoverButton-${c.sloId}`}
              isDisabled={integrityBlock || busy}
              isLoading={busy}
              onClick={() => {
                if (c.tombstoned) {
                  // Tombstone badge owns the confirmation flow; scroll to it.
                  return;
                }
                performRecover(c, false);
              }}
            >
              Recover
            </EuiButton>
          );
          const wrapped = integrityBlock ? (
            <EuiToolTip content="Spec drift detected — recover is unsafe.">
              {recoverButton}
            </EuiToolTip>
          ) : c.tombstoned ? (
            <EuiToolTip content="Click the tombstone badge to confirm before recovering.">
              {recoverButton}
            </EuiToolTip>
          ) : (
            recoverButton
          );
          return (
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>{wrapped}</EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="s"
                  data-test-subj={`sloAdoption-recoverTab-dismissButton-${c.sloId}`}
                  onClick={() => dismissRow(c)}
                >
                  Dismiss
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        align: 'right',
        width: '40px',
        isExpander: true,
        render: (c: OrphanCandidate) => {
          const key = rowKey(c);
          const expanded = Boolean(itemIdToExpandedRowMap[key]);
          return (
            <EuiButtonEmpty
              size="s"
              iconType={expanded ? 'arrowUp' : 'arrowDown'}
              aria-label={expanded ? 'Collapse row' : 'Expand row'}
              data-test-subj={`sloAdoption-recoverTab-expandButton-${c.sloId}`}
              onClick={() => toggleExpand(c)}
            >
              {expanded ? 'Hide' : 'Preview'}
            </EuiButtonEmpty>
          );
        },
      },
    ],
    [dismissRow, inFlight, itemIdToExpandedRowMap, performRecover, toggleExpand]
  );

  const itemId = useCallback((c: OrphanCandidate) => rowKey(c), []);

  const rowErrorBanner = useMemo(() => {
    const entries = Object.entries(rowErrors);
    if (entries.length === 0) return null;
    return (
      <>
        <EuiSpacer size="s" />
        {entries.map(([key, msg]) => (
          <EuiCallOut
            key={key}
            color="danger"
            iconType="alert"
            size="s"
            title="Recover failed"
            data-test-subj={`sloAdoption-recoverTab-rowError-${key}`}
          >
            {msg}
          </EuiCallOut>
        ))}
      </>
    );
  }, [rowErrors]);

  const dismissedCount = dismissed.size;

  return (
    <div data-test-subj="sloAdoption-recoverTab">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem>
          <EuiText size="s" color="subdued">
            {visibleCandidates.length} adoptable{' '}
            {visibleCandidates.length === 1 ? 'orphan' : 'orphans'}
            {dismissedCount > 0 ? ` · ${dismissedCount} dismissed` : ''}
          </EuiText>
        </EuiFlexItem>
        {dismissedCount > 0 ? (
          <EuiFlexItem grow={false}>
            <EuiSwitch
              label="Show dismissed"
              checked={showDismissed}
              onChange={(e) => setShowDismissed(e.target.checked)}
              data-test-subj="sloAdoption-recoverTab-showDismissed"
            />
          </EuiFlexItem>
        ) : null}
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            iconType="refresh"
            onClick={refresh}
            isLoading={loading}
            data-test-subj="sloAdoption-recoverTab-refresh"
          >
            Refresh
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />

      {refreshError ? (
        <>
          <EuiCallOut
            color="danger"
            iconType="alert"
            title="Failed to refresh orphan list"
            data-test-subj="sloAdoption-recoverTab-refreshError"
          >
            {refreshError}
          </EuiCallOut>
          <EuiSpacer size="s" />
        </>
      ) : null}

      <EuiPanel paddingSize="s">
        {visibleCandidates.length === 0 ? (
          <EuiEmptyPrompt
            iconType="check"
            title={<h3>No adoptable orphans</h3>}
            body={
              <p>
                Every recording group on the targeted datasources matches a managed SLO. Nothing to
                recover.
              </p>
            }
            data-test-subj="sloAdoption-recoverTab-emptyPrompt"
          />
        ) : (
          <EuiInMemoryTable<OrphanCandidate>
            items={visibleCandidates}
            columns={columns}
            itemId={itemId}
            itemIdToExpandedRowMap={itemIdToExpandedRowMap}
            isExpandable
            loading={loading}
            data-test-subj="sloAdoption-recoverTab-table"
          />
        )}
      </EuiPanel>

      {rowErrorBanner}

      <EuiSpacer size="m" />
      <EuiAccordion
        id="sloAdoption-recoverTab-unknownsAccordion"
        buttonContent={`Unknown orphan groups (${unknowns.length})`}
        paddingSize="s"
        data-test-subj="sloAdoption-recoverTab-unknownsAccordion"
      >
        {unknowns.length === 0 ? (
          <EuiText size="s" color="subdued">
            No unknown orphan groups were reported.
          </EuiText>
        ) : (
          <EuiInMemoryTable<OrphanUnknown>
            items={unknowns}
            columns={[
              {
                name: 'SLO',
                render: (u: OrphanUnknown) => (
                  <EuiText
                    size="s"
                    data-test-subj={
                      u.sourceSloId
                        ? `sloAdoption-recoverTab-unknownsSloId-${u.sourceSloId}`
                        : undefined
                    }
                  >
                    {u.sourceSloId ?? '—'}
                  </EuiText>
                ),
              },
              { name: 'Datasource', render: (u: OrphanUnknown) => u.datasourceId },
              { name: 'Group', render: (u: OrphanUnknown) => u.groupName },
              {
                name: 'Reason',
                render: (u: OrphanUnknown) =>
                  u.specIntegrity === 'unsupported_schema' ? (
                    <EuiText
                      size="s"
                      color="danger"
                      data-test-subj={`sloAdoption-recoverTab-unknownsUnsupportedSchema-${
                        u.sourceSloId ?? u.groupName
                      }`}
                    >
                      Unsupported provenance schemaVersion{' '}
                      {typeof u.schemaVersion === 'number' ? u.schemaVersion : '(unknown)'} —
                      upgrade the plugin or adopt manually.
                    </EuiText>
                  ) : (
                    <EuiText size="s" color="subdued">
                      {u.diagnostic ?? '—'}
                    </EuiText>
                  ),
              },
            ]}
            data-test-subj="sloAdoption-recoverTab-unknownsTable"
          />
        )}
      </EuiAccordion>
    </div>
  );
};
