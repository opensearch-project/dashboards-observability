/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Skeleton detail page. Surfaces name/service/state and the raw spec for
 * debugging. Fuller burn-rate chart, budget panel, alerts panel, and
 * rule-health surface land in later PRs.
 */

import React, { useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { i18n } from '@osd/i18n';
import {
  EuiButton,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLoadingContent,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { ChromeStart, NotificationsStart } from '../../../../../../../src/core/public';
import type { SloDocument, SloLiveStatus } from '../../../../../common/slo/slo_types';
import { getSloHealthColor, getSloHealthLabel } from '../../../../../common/slo/state';
import { SloApiClient, extractServerMessage } from './slo_api_client';

export interface SloDetailPageProps {
  apiClient: SloApiClient;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

const I18N = {
  breadcrumbSlos: i18n.translate('observability.slo.detail.breadcrumbSlos', {
    defaultMessage: 'SLOs',
  }),
  backToListing: i18n.translate('observability.slo.detail.backToListing', {
    defaultMessage: 'Back to listing',
  }),
  labelService: i18n.translate('observability.slo.detail.labelService', {
    defaultMessage: 'Service',
  }),
  labelOwnerTeam: i18n.translate('observability.slo.detail.labelOwnerTeam', {
    defaultMessage: 'Owner team',
  }),
  labelDatasource: i18n.translate('observability.slo.detail.labelDatasource', {
    defaultMessage: 'Datasource',
  }),
  labelTarget: i18n.translate('observability.slo.detail.labelTarget', {
    defaultMessage: 'Target',
  }),
  labelWindow: i18n.translate('observability.slo.detail.labelWindow', {
    defaultMessage: 'Window',
  }),
  windowRolling: (duration: string) =>
    i18n.translate('observability.slo.detail.windowRolling', {
      defaultMessage: '{duration} rolling',
      values: { duration },
    }),
  windowCalendar: (period: string) =>
    i18n.translate('observability.slo.detail.windowCalendar', {
      defaultMessage: '{period} calendar',
      values: { period },
    }),
  specHeading: i18n.translate('observability.slo.detail.specHeading', {
    defaultMessage: 'Spec',
  }),
  notFound: i18n.translate('observability.slo.detail.notFound', {
    defaultMessage: 'SLO not found.',
  }),
  toastLoadFailed: i18n.translate('observability.slo.detail.toastLoadFailed', {
    defaultMessage: 'Failed to load SLO',
  }),
};

export const SloDetailPage: React.FC<SloDetailPageProps> = ({
  apiClient,
  chrome,
  notifications,
  parentBreadcrumb,
}) => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const [doc, setDoc] = useState<(SloDocument & { liveStatus: SloLiveStatus }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `cancelled` gates the state writes so an in-flight fetch whose
    // component unmounted (navigation back to listing) doesn't
    // setState-on-unmounted. Also guards against the id param changing
    // before the previous fetch settled.
    let cancelled = false;
    (async () => {
      try {
        const d = await apiClient.get(id);
        if (cancelled) return;
        setDoc(d);
      } catch (err) {
        if (cancelled) return;
        notifications.toasts.addDanger({
          title: I18N.toastLoadFailed,
          text: extractServerMessage(err),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiClient, id, notifications]);

  // Breadcrumb tracks the resolved SLO name once the fetch lands — falls back
  // to the raw id during the loading window.
  useEffect(() => {
    chrome.setBreadcrumbs([
      parentBreadcrumb,
      { text: I18N.breadcrumbSlos, href: '#/slos' },
      { text: doc?.spec.name ?? id, href: `#/slos/${encodeURIComponent(id)}` },
    ]);
  }, [chrome, id, doc, parentBreadcrumb]);

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageContent>
          {/* The SLO name already renders in the OSD chrome h1 via the
              breadcrumb; repeating it here would make the page carry two
              identical headings. Surface the health status + back-to-listing
              on the same row instead. */}
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
            <EuiFlexItem grow={false}>
              {doc ? (
                <EuiHealth color={getSloHealthColor(doc.liveStatus.state)}>
                  {getSloHealthLabel(doc.liveStatus.state)}
                </EuiHealth>
              ) : null}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton onClick={() => history.push('/slos')}>{I18N.backToListing}</EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer />
          {loading ? (
            <EuiLoadingContent lines={4} />
          ) : doc ? (
            <>
              <EuiDescriptionList
                type="column"
                compressed
                listItems={[
                  { title: I18N.labelService, description: doc.spec.service },
                  { title: I18N.labelOwnerTeam, description: doc.spec.owner.teams.join(', ') },
                  { title: I18N.labelDatasource, description: doc.spec.datasourceId },
                  {
                    title: I18N.labelTarget,
                    description: doc.spec.objectives[0]
                      ? `${(doc.spec.objectives[0].target * 100).toFixed(2)}%`
                      : '—',
                  },
                  {
                    title: I18N.labelWindow,
                    description:
                      doc.spec.window.type === 'rolling'
                        ? I18N.windowRolling(doc.spec.window.duration)
                        : I18N.windowCalendar(doc.spec.window.period),
                  },
                ]}
              />
              <EuiSpacer size="l" />
              <EuiTitle size="xs">
                <h3>{I18N.specHeading}</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
                {JSON.stringify(doc.spec, null, 2)}
              </EuiCodeBlock>
            </>
          ) : (
            <EuiText>{I18N.notFound}</EuiText>
          )}
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
