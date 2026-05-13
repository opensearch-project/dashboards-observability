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
import { useHistory } from 'react-router-dom';
import {
  EuiBasicTable,
  EuiButton,
  EuiConfirmModal,
  EuiEmptyPrompt,
  EuiHealth,
  EuiLink,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentHeader,
  EuiPageContentHeaderSection,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type {
  ChromeStart,
  HttpStart,
  NotificationsStart,
} from '../../../../../../../src/core/public';
import { formatPct } from '../../../../../common/slo/format';
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
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<SloSummary | null>(null);

  useEffect(() => {
    chrome.setBreadcrumbs([{ text: 'SLOs', href: '#/slos' }]);
  }, [chrome]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.list();
      // The server returns paginated `{ items, total, ... }` — support both
      // shapes (the in-flight listing projection on the server may return a
      // bare summary array until pagination lands).
      const items = Array.isArray(((res as unknown) as { items?: unknown }).items)
        ? ((res as unknown) as { items: SloSummary[] }).items
        : ((res as unknown) as SloSummary[]);
      setRows(items ?? []);
    } catch (err) {
      notifications.toasts.addError(err as Error, { title: 'Failed to load SLOs' });
    } finally {
      setLoading(false);
    }
  }, [apiClient, notifications]);

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

  const columns = [
    {
      field: 'name',
      name: 'Name',
      render: (_v: string, slo: SloSummary) => (
        <EuiLink onClick={() => history.push(`/slos/${slo.id}`)} data-test-subj="sloRowName">
          {slo.name}
        </EuiLink>
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
      render: (v: number) => formatPct(v, { decimals: 2 }),
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
        <EuiPageHeader>
          <EuiPageHeaderSection>
            <EuiTitle size="l">
              <h1>Service level objectives</h1>
            </EuiTitle>
          </EuiPageHeaderSection>
          <EuiPageHeaderSection>
            <EuiButton
              fill
              iconType="plusInCircle"
              onClick={() => history.push('/slos/create')}
              data-test-subj="sloCreateBtn"
            >
              Create SLO
            </EuiButton>
          </EuiPageHeaderSection>
        </EuiPageHeader>
        <EuiPageContent>
          <EuiPageContentHeader>
            <EuiPageContentHeaderSection>
              <EuiText size="s">
                {rows.length} SLO{rows.length === 1 ? '' : 's'}
              </EuiText>
            </EuiPageContentHeaderSection>
          </EuiPageContentHeader>
          <EuiSpacer />
          {!loading && rows.length === 0 ? (
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
