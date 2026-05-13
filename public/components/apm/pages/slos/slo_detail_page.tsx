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
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLoadingContent,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageHeader,
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
    chrome.setBreadcrumbs([
      { text: 'SLOs', href: '#/slos' },
      { text: id, href: `#/slos/${id}` },
    ]);
  }, [chrome, id]);

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

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageHeader>
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiTitle size="l">
                <h1>{doc?.spec.name ?? id}</h1>
              </EuiTitle>
              {doc ? (
                <>
                  <EuiSpacer size="xs" />
                  <EuiHealth color={getSloHealthColor(doc.liveStatus.state)}>
                    {getSloHealthLabel(doc.liveStatus.state)}
                  </EuiHealth>
                </>
              ) : null}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton onClick={() => history.push('/slos')}>Back to listing</EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageHeader>
        <EuiPageContent>
          {loading ? (
            <EuiLoadingContent lines={4} />
          ) : doc ? (
            <>
              <EuiText size="s">
                <p>
                  <strong>Service:</strong> {doc.spec.service}
                  <br />
                  <strong>Owner team:</strong> {doc.spec.owner.teams.join(', ')}
                  <br />
                  <strong>Datasource:</strong> {doc.spec.datasourceId}
                </p>
              </EuiText>
              <EuiSpacer />
              <EuiTitle size="xs">
                <h2>Spec</h2>
              </EuiTitle>
              <EuiCodeBlock language="json" fontSize="s" isCopyable>
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
