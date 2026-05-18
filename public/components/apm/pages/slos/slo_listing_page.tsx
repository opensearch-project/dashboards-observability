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
import { i18n } from '@osd/i18n';
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
import type { ChromeStart, NotificationsStart } from '../../../../../../../src/core/public';
import { formatPct, SLO_PRECISION, TABULAR_NUMS_STYLE } from '../../../../../common/slo/format';
import { getSloHealthColor, getSloHealthLabel } from '../../../../../common/slo/state';
import type { SloSummary } from '../../../../../common/slo/slo_types';
import { SloApiClient, extractServerMessage } from './slo_api_client';

export interface SloListingPageProps {
  apiClient: SloApiClient;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

const I18N = {
  breadcrumbSlos: i18n.translate('observability.slo.listing.breadcrumbSlos', {
    defaultMessage: 'SLOs',
  }),
  countLabel: (total: number) =>
    i18n.translate('observability.slo.listing.countLabel', {
      defaultMessage: '{total} {total, plural, one {SLO} other {SLOs}}',
      values: { total },
    }),
  createButton: i18n.translate('observability.slo.listing.createButton', {
    defaultMessage: 'Create SLO',
  }),
  emptyTitle: i18n.translate('observability.slo.listing.emptyTitle', {
    defaultMessage: 'No SLOs yet',
  }),
  emptyBody: i18n.translate('observability.slo.listing.emptyBody', {
    defaultMessage:
      'Create your first SLO to track service-level objectives against Prometheus-backed metrics.',
  }),
  colName: i18n.translate('observability.slo.listing.colName', {
    defaultMessage: 'Name',
  }),
  colService: i18n.translate('observability.slo.listing.colService', {
    defaultMessage: 'Service',
  }),
  colState: i18n.translate('observability.slo.listing.colState', {
    defaultMessage: 'State',
  }),
  colTarget: i18n.translate('observability.slo.listing.colTarget', {
    defaultMessage: 'Target',
  }),
  colActions: i18n.translate('observability.slo.listing.colActions', {
    defaultMessage: 'Actions',
  }),
  actionDelete: i18n.translate('observability.slo.listing.actionDelete', {
    defaultMessage: 'Delete',
  }),
  actionDeleteDescription: i18n.translate('observability.slo.listing.actionDeleteDescription', {
    defaultMessage: 'Delete this SLO',
  }),
  deleteConfirmTitle: (name: string) =>
    i18n.translate('observability.slo.listing.deleteConfirmTitle', {
      defaultMessage: 'Delete SLO "{name}"?',
      values: { name },
    }),
  deleteConfirmBody: i18n.translate('observability.slo.listing.deleteConfirmBody', {
    defaultMessage: 'Tearing down the SLO also removes its rule groups from the ruler.',
  }),
  deleteConfirmCancel: i18n.translate('observability.slo.listing.deleteConfirmCancel', {
    defaultMessage: 'Cancel',
  }),
  deleteConfirmConfirm: i18n.translate('observability.slo.listing.deleteConfirmConfirm', {
    defaultMessage: 'Delete',
  }),
  toastDeleted: (name: string) =>
    i18n.translate('observability.slo.listing.toastDeleted', {
      defaultMessage: 'Deleted "{name}"',
      values: { name },
    }),
  toastLoadFailed: i18n.translate('observability.slo.listing.toastLoadFailed', {
    defaultMessage: 'Failed to load SLOs',
  }),
  toastDeleteFailed: i18n.translate('observability.slo.listing.toastDeleteFailed', {
    defaultMessage: 'Failed to delete SLO',
  }),
};

export const SloListingPage: React.FC<SloListingPageProps> = ({
  apiClient,
  chrome,
  notifications,
  parentBreadcrumb,
}) => {
  const history = useHistory();
  const [rows, setRows] = useState<SloSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<SloSummary | null>(null);
  // Monotonic generation counter: each `refresh()` captures its number,
  // and only the most-recent in-flight response is allowed to write state.
  // Protects against a stale response landing after the component unmounts
  // or after a pagination change fires a newer fetch.
  const generationRef = React.useRef(0);

  useEffect(() => {
    chrome.setBreadcrumbs([parentBreadcrumb, { text: I18N.breadcrumbSlos, href: '#/slos' }]);
  }, [chrome, parentBreadcrumb]);

  const refresh = useCallback(async () => {
    const myGen = ++generationRef.current;
    setLoading(true);
    try {
      // Server pages are 1-indexed; EUI's `pageIndex` is 0-indexed.
      const envelope = await apiClient.list({ page: pageIndex + 1, pageSize });
      if (myGen !== generationRef.current) return;
      setRows(envelope.results);
      setTotal(envelope.total);
    } catch (err) {
      if (myGen !== generationRef.current) return;
      notifications.toasts.addDanger({
        title: I18N.toastLoadFailed,
        text: extractServerMessage(err),
      });
    } finally {
      if (myGen === generationRef.current) setLoading(false);
    }
  }, [apiClient, notifications, pageIndex, pageSize]);

  useEffect(() => {
    refresh();
    // On unmount, tick the generation so in-flight responses drop silently.
    return () => {
      generationRef.current++;
    };
  }, [refresh]);

  const onDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await apiClient.delete(pendingDelete.id);
      notifications.toasts.addSuccess(I18N.toastDeleted(pendingDelete.name));
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      notifications.toasts.addDanger({
        title: I18N.toastDeleteFailed,
        text: extractServerMessage(err),
      });
    }
  }, [apiClient, pendingDelete, notifications, refresh]);

  const columns: Array<EuiBasicTableColumn<SloSummary>> = [
    {
      field: 'name',
      name: I18N.colName,
      render: (_v: string, slo: SloSummary) => (
        // Use react-router's `Link` (renders a real `<a href="#/slos/...">`)
        // so middle-click / cmd-click open in a new tab. EUI's own `EuiLink`
        // forbids `href` + `onClick` together, and a plain anchor wouldn't
        // pick up the primary-link style. The `euiLink` class matches.
        <Link
          to={`/slos/${encodeURIComponent(slo.id)}`}
          className="euiLink euiLink--primary"
          data-test-subj="sloRowName"
        >
          {slo.name}
        </Link>
      ),
    },
    { field: 'service', name: I18N.colService },
    {
      field: 'status.state',
      name: I18N.colState,
      render: (_v: unknown, slo: SloSummary) => (
        <EuiHealth color={getSloHealthColor(slo.status.state)}>
          {getSloHealthLabel(slo.status.state)}
        </EuiHealth>
      ),
    },
    {
      field: 'worstTarget',
      name: I18N.colTarget,
      align: 'right' as const,
      render: (v: number) => (
        <span style={TABULAR_NUMS_STYLE}>{formatPct(v, { decimals: SLO_PRECISION.target })}</span>
      ),
    },
    {
      name: I18N.colActions,
      actions: [
        {
          name: I18N.actionDelete,
          description: I18N.actionDeleteDescription,
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
                {I18N.countLabel(total)}
              </EuiText>
            </EuiPageContentHeaderSection>
            <EuiPageContentHeaderSection>
              <EuiButton
                fill
                iconType="plusInCircle"
                onClick={() => history.push('/slos/create')}
                data-test-subj="sloCreateBtn"
              >
                {I18N.createButton}
              </EuiButton>
            </EuiPageContentHeaderSection>
          </EuiPageContentHeader>
          <EuiSpacer size="s" />
          {!loading && total === 0 ? (
            <EuiEmptyPrompt
              iconType="visGauge"
              title={<h2>{I18N.emptyTitle}</h2>}
              body={<p>{I18N.emptyBody}</p>}
              actions={
                <EuiButton
                  fill
                  onClick={() => history.push('/slos/create')}
                  data-test-subj="sloCreateBtnEmpty"
                >
                  {I18N.createButton}
                </EuiButton>
              }
            />
          ) : (
            <EuiBasicTable<SloSummary>
              items={rows}
              columns={columns}
              loading={loading}
              rowProps={(row) => ({ 'data-test-subj': `sloRow_${row.id}` })}
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
          title={I18N.deleteConfirmTitle(pendingDelete.name)}
          onCancel={() => setPendingDelete(null)}
          onConfirm={onDelete}
          cancelButtonText={I18N.deleteConfirmCancel}
          confirmButtonText={I18N.deleteConfirmConfirm}
          buttonColor="danger"
          data-test-subj="sloDeleteConfirm"
        >
          {I18N.deleteConfirmBody}
        </EuiConfirmModal>
      ) : null}
    </EuiPage>
  );
};
