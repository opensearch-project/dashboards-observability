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
import { SloApiClient } from './slo_api_client';

export interface SloDetailPageProps {
  apiClient: SloApiClient;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

export const SloDetailPage: React.FC<SloDetailPageProps> = ({
  apiClient,
  chrome,
  notifications,
}) => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const [doc, setDoc] = useState<(SloDocument & { liveStatus: SloLiveStatus }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await apiClient.get(id);
        setDoc(d);
      } catch (err) {
        notifications.toasts.addError(err as Error, { title: 'Failed to load SLO' });
      } finally {
        setLoading(false);
      }
    })();
  }, [apiClient, id, notifications]);

  // Breadcrumb tracks the resolved SLO name once the fetch lands — falls back
  // to the raw id during the loading window.
  useEffect(() => {
    chrome.setBreadcrumbs([
      { text: 'SLOs', href: '#/slos' },
      { text: doc?.spec.name ?? id, href: `#/slos/${id}` },
    ]);
  }, [chrome, id, doc]);

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
              <EuiButton onClick={() => history.push('/slos')}>Back to listing</EuiButton>
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
                  { title: 'Service', description: doc.spec.service },
                  { title: 'Owner team', description: doc.spec.owner.teams.join(', ') },
                  { title: 'Datasource', description: doc.spec.datasourceId },
                  {
                    title: 'Target',
                    description: `${(doc.spec.objectives[0]?.target * 100).toFixed(2)}%`,
                  },
                  {
                    title: 'Window',
                    description:
                      doc.spec.window.type === 'rolling'
                        ? `${doc.spec.window.duration} rolling`
                        : `${doc.spec.window.period} calendar`,
                  },
                ]}
              />
              <EuiSpacer size="l" />
              <EuiTitle size="xs">
                <h3>Spec</h3>
              </EuiTitle>
              <EuiSpacer size="s" />
              <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
                {JSON.stringify(doc.spec, null, 2)}
              </EuiCodeBlock>
            </>
          ) : (
            <EuiText>SLO not found.</EuiText>
          )}
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
