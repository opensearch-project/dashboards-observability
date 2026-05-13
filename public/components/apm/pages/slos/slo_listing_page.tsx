/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO listing page — minimal surface for PR 1.
 *
 * Shows a table of SLOs with name, service, state, and a delete action.
 * Larger filter/facet surfaces and the status-aggregator polling loop land in
 * later PRs. This page intentionally stays thin: CRUD is the whole point of
 * PR 1.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import {
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButton,
  EuiConfirmModal,
  EuiEmptyPrompt,
  EuiHealth,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentHeader,
  EuiPageContentHeaderSection,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import type {
  ChromeStart,
  HttpStart,
  NotificationsStart,
} from '../../../../../../../src/core/public';
import { formatPct, SLO_PRECISION, TABULAR_NUMS_STYLE } from '../../../../../common/slo/format';
import { getSloHealthColor, getSloHealthLabel } from '../../../../../common/slo/state';
import type { SloSummary } from '../../../../../common/slo/slo_types';
import { SloApiClient } from './slo_api_client';

export interface SloListingPageProps {
  apiClient: SloApiClient;
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

export const SloListingPage: React.FC<SloListingPageProps> = ({
  apiClient,
  chrome,
  notifications,
}) => {
  const history = useHistory();
  const [rows, setRows] = useState<SloSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<SloSummary | null>(null);

  useEffect(() => {
    chrome.setBreadcrumbs([{ text: 'SLOs', href: '#/slos' }]);
  }, [chrome]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Server pages are 1-indexed; EUI's `pageIndex` is 0-indexed.
      const res = await apiClient.list({ page: pageIndex + 1, pageSize });
      const raw = res as unknown;
      if (Array.isArray((raw as { results?: unknown }).results)) {
        const envelope = raw as { results: SloSummary[]; total: number };
        setRows(envelope.results);
        setTotal(envelope.total);
      } else if (Array.isArray(raw)) {
        setRows(raw as SloSummary[]);
        setTotal((raw as SloSummary[]).length);
      } else {
        setRows([]);
        setTotal(0);
      }
    } catch (err) {
      notifications.toasts.addError(err as Error, { title: 'Failed to load SLOs' });
    } finally {
      setLoading(false);
    }
  }, [apiClient, notifications, pageIndex, pageSize]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await apiClient.delete(pendingDelete.id);
      notifications.toasts.addSuccess(`Deleted "${pendingDelete.name}"`);
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      notifications.toasts.addError(err as Error, { title: 'Failed to delete SLO' });
    }
  }, [apiClient, pendingDelete, notifications, refresh]);

  const columns: Array<EuiBasicTableColumn<SloSummary>> = [
    {
      field: 'name',
      name: 'Name',
      render: (_v: string, slo: SloSummary) => (
        // Use react-router's `Link` (renders a real `<a href="#/slos/...">`)
        // so middle-click / cmd-click open in a new tab. EUI's own `EuiLink`
        // forbids `href` + `onClick` together, and a plain anchor wouldn't
        // pick up the primary-link style. The `euiLink` class matches.
        <Link
          to={`/slos/${slo.id}`}
          className="euiLink euiLink--primary"
          data-test-subj="sloRowName"
        >
          {slo.name}
        </Link>
      ),
    },
    { field: 'service', name: 'Service' },
    {
      field: 'status.state',
      name: 'State',
      render: (_v: unknown, slo: SloSummary) => (
        <EuiHealth color={getSloHealthColor(slo.status.state)}>
          {getSloHealthLabel(slo.status.state)}
        </EuiHealth>
      ),
    },
    {
      field: 'worstTarget',
      name: 'Target',
      align: 'right' as const,
      render: (v: number) => (
        <span style={TABULAR_NUMS_STYLE}>{formatPct(v, { decimals: SLO_PRECISION.target })}</span>
      ),
    },
    {
      name: 'Actions',
      actions: [
        {
          name: 'Delete',
          description: 'Delete this SLO',
          type: 'icon' as const,
          icon: 'trash',
          color: 'danger' as const,
          onClick: (slo: SloSummary) => setPendingDelete(slo),
          'data-test-subj': 'sloRowDelete',
        },
      ],
    },
  ];

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageContent>
          <EuiPageContentHeader>
            <EuiPageContentHeaderSection>
              <EuiText size="s" color="subdued">
                {total} SLO{total === 1 ? '' : 's'}
              </EuiText>
            </EuiPageContentHeaderSection>
            <EuiPageContentHeaderSection>
              <EuiButton
                fill
                iconType="plusInCircle"
                onClick={() => history.push('/slos/create')}
                data-test-subj="sloCreateBtn"
              >
                Create SLO
              </EuiButton>
            </EuiPageContentHeaderSection>
          </EuiPageContentHeader>
          <EuiSpacer size="s" />
          {!loading && total === 0 ? (
            <EuiEmptyPrompt
              iconType="visGauge"
              title={<h2>No SLOs yet</h2>}
              body={
                <p>
                  Create your first SLO to track service-level objectives against Prometheus-backed
                  metrics.
                </p>
              }
              actions={
                <EuiButton
                  fill
                  onClick={() => history.push('/slos/create')}
                  data-test-subj="sloCreateBtnEmpty"
                >
                  Create SLO
                </EuiButton>
              }
            />
          ) : (
            <EuiBasicTable<SloSummary>
              items={rows}
              columns={columns}
              loading={loading}
              rowProps={(row) => ({ 'data-test-subj': `sloRow-${row.id}` })}
              pagination={{
                pageIndex,
                pageSize,
                totalItemCount: total,
                pageSizeOptions: [10, 20, 50, 100],
              }}
              onChange={({ page }: { page?: { index: number; size: number } }) => {
                if (!page) return;
                setPageIndex(page.index);
                setPageSize(page.size);
              }}
            />
          )}
        </EuiPageContent>
      </EuiPageBody>
      {pendingDelete ? (
        <EuiConfirmModal
          title={`Delete SLO "${pendingDelete.name}"?`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={onDelete}
          cancelButtonText="Cancel"
          confirmButtonText="Delete"
          buttonColor="danger"
          data-test-subj="sloDeleteConfirm"
        >
          Tearing down the SLO also removes its rule groups from the ruler.
        </EuiConfirmModal>
      ) : null}
    </EuiPage>
  );
};
