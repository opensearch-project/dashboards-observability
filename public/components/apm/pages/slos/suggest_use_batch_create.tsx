/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `useBatchCreate` — owns the in-flight batch-create state for the Suggest
 * SLOs page. Encapsulates per-row status, cumulative progress, the bounded
 * concurrency runner, and the success/failure toast wiring so the page only
 * sees a couple of stable callbacks.
 */

import React, { useCallback, useState } from 'react';
import { EuiLink, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { History } from 'history';
import type { NotificationsStart } from '../../../../../../../src/core/public';
import { toMountPoint } from '../../../../../../../src/plugins/opensearch_dashboards_react/public';
import type { SloApiClient } from './slo_api_client';
import type { Suggestion } from './suggest_engine';
import { withConcurrency } from './suggest_concurrency';

/** Per-draft status used by the inline rows + progress strip. */
export type RowStatus = 'pending' | 'creating' | 'success' | 'error';

export interface RowStatusEntry {
  status: RowStatus;
  message?: string;
}

export type RowStatusMap = Record<string, RowStatusEntry>;

export interface BatchCreateProgress {
  done: number;
  failed: number;
  total: number;
}

export interface UseBatchCreateArgs {
  apiClient: Pick<SloApiClient, 'create'>;
  notifications: NotificationsStart;
  history: History;
}

export interface UseBatchCreateResult {
  isCreating: boolean;
  rowStatusMap: RowStatusMap;
  progress: BatchCreateProgress | null;
  /** Run the create flow against the supplied (already override-decorated) picks. */
  runCreate: (picks: Suggestion[]) => Promise<void>;
}

/** Bounded concurrency: ruler writes are safe concurrent, but four in-flight
 *  at a time keeps server load sensible and preserves per-row error isolation. */
const CREATE_CONCURRENCY_LIMIT = 4;

export function useBatchCreate({
  apiClient,
  notifications,
  history,
}: UseBatchCreateArgs): UseBatchCreateResult {
  const [isCreating, setIsCreating] = useState(false);
  const [rowStatusMap, setRowStatusMap] = useState<RowStatusMap>({});
  const [progress, setProgress] = useState<BatchCreateProgress | null>(null);

  const runCreate = useCallback(
    async (picks: Suggestion[]) => {
      if (picks.length === 0) return;
      setIsCreating(true);
      // Seed row status so each inline row renders a pending spinner slot
      // immediately — the user can see which rows are in the work queue.
      setRowStatusMap((prev) => {
        const next = { ...prev };
        for (const p of picks) next[p.key] = { status: 'pending' };
        return next;
      });
      setProgress({ done: 0, failed: 0, total: picks.length });

      const results: Array<{ key: string; ok: boolean; message?: string }> = [];
      let done = 0;
      let failed = 0;

      await withConcurrency(CREATE_CONCURRENCY_LIMIT, picks, async (s) => {
        setRowStatusMap((prev) => ({ ...prev, [s.key]: { status: 'creating' } }));
        try {
          await apiClient.create(s.input);
          results.push({ key: s.key, ok: true });
          setRowStatusMap((prev) => ({ ...prev, [s.key]: { status: 'success' } }));
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          results.push({ key: s.key, ok: false, message });
          setRowStatusMap((prev) => ({ ...prev, [s.key]: { status: 'error', message } }));
          failed += 1;
        } finally {
          done += 1;
          setProgress({ done, failed, total: picks.length });
        }
      });

      setIsCreating(false);
      setProgress(null);
      const failures = results.filter((r) => !r.ok);
      if (failures.length === 0) {
        notifications.toasts.addSuccess({
          title: i18n.translate('observability.apm.slo.suggest.batchCreate.successToast', {
            defaultMessage: '{count, plural, one {Created # SLO} other {Created # SLOs}}',
            values: { count: results.length },
          }),
          // A mount-point so the "View in listing" action stays clickable;
          // auto-redirect is removed so the user keeps the row feedback they
          // just earned and can inspect any partial failure before leaving.
          text: toMountPoint(
            <EuiText size="s">
              <p>
                {i18n.translate('observability.apm.slo.suggest.batchCreate.successToastBody', {
                  defaultMessage:
                    'Alerting rules are provisioned and will begin evaluating on the next ruler cycle.',
                })}
              </p>
              <EuiLink
                onClick={() => history.push('/slos')}
                data-test-subj="slosSuggestCreateViewListing"
              >
                {i18n.translate('observability.apm.slo.suggest.batchCreate.viewInListingLink', {
                  defaultMessage: 'View in listing',
                })}
              </EuiLink>
            </EuiText>
          ),
        });
      } else {
        notifications.toasts.addDanger({
          title: i18n.translate('observability.apm.slo.suggest.batchCreate.failureToastTitle', {
            defaultMessage: '{failed} of {total} failed',
            values: { failed: failures.length, total: results.length },
          }),
          text: failures
            .map((f) =>
              i18n.translate('observability.apm.slo.suggest.batchCreate.failureLine', {
                defaultMessage: '• {key}: {message}',
                values: {
                  key: f.key,
                  message:
                    f.message ??
                    i18n.translate('observability.apm.slo.suggest.batchCreate.unknownError', {
                      defaultMessage: 'unknown error',
                    }),
                },
              })
            )
            .join('\n'),
        });
      }
    },
    [apiClient, history, notifications]
  );

  return { isCreating, rowStatusMap, progress, runCreate };
}
