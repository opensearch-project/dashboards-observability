/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 4 (W4.8) — SLO Adoption admin page.
 *
 * Shell that owns the feature-flag gate, breadcrumb wiring, and the Recover
 * surface.
 *
 * Feature-flag gate strategy:
 *   - Fire `GET /_orphans` on mount.
 *   - 412 → render a simple "Orphan adoption disabled" notice with no table.
 *   - 200 → seed the Recover table state with the already-fetched payload so
 *     we don't make an immediate second request.
 *   - Any other error → render a retry-capable error callout.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  EuiButton,
  EuiEmptyPrompt,
  EuiLoadingSpinner,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type {
  ChromeStart,
  HttpStart,
  NotificationsStart,
} from '../../../../../../../../src/core/public';
import type { OrphanListResponse, SloApiClient } from '../slo_api_client';
import { isPreconditionFailed } from '../slo_api_client';
import { RecoverTab } from './recover_tab';

export interface SloAdoptionPageProps {
  apiClient: SloApiClient;
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

type FeatureState = 'loading' | 'enabled' | 'disabled' | 'error';

/** Unwrap an OSD http error envelope into a displayable string. */
function extractErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const body = (err as { body?: { message?: unknown } }).body;
    if (body && typeof body.message === 'string') return body.message;
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return String(err);
}

export const SloAdoptionPage: React.FC<SloAdoptionPageProps> = ({
  apiClient,
  chrome,
  notifications,
  parentBreadcrumb,
}) => {
  const [featureState, setFeatureState] = useState<FeatureState>('loading');
  const [initialData, setInitialData] = useState<OrphanListResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Breadcrumb is mount-only.
  useEffect(() => {
    chrome.setBreadcrumbs([parentBreadcrumb, { text: 'SLO/SLI' }, { text: 'Adoption' }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    setFeatureState('loading');
    setErrorMessage(null);
    apiClient
      .listOrphans()
      .then((data) => {
        if (cancelled) return;
        setInitialData(data);
        setFeatureState('enabled');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isPreconditionFailed(err)) {
          setFeatureState('disabled');
          return;
        }
        setErrorMessage(extractErrorMessage(err));
        setFeatureState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  useEffect(() => {
    const cancelList = load();
    return () => {
      cancelList?.();
    };
  }, [load]);

  return (
    <EuiPage data-test-subj="sloAdoption-page">
      <EuiPageBody component="main">
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            <EuiTitle size="l">
              <h1>SLO adoption</h1>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiText size="s" color="subdued">
              <p>
                Recover SLOs whose saved objects were deleted out-of-band while their rule groups
                still live on the ruler. Rules are only adopted after integrity verification.
              </p>
            </EuiText>
            <EuiSpacer size="m" />

            {featureState === 'loading' ? (
              <EuiPanel data-test-subj="sloAdoption-page-loading">
                <EuiEmptyPrompt
                  icon={<EuiLoadingSpinner size="xl" />}
                  title={<h3>Loading adoption data…</h3>}
                  body={<p>Checking feature flags and fetching orphan candidates.</p>}
                />
              </EuiPanel>
            ) : featureState === 'disabled' ? (
              <EuiPanel data-test-subj="sloAdoption-page-disabledPrompt">
                <EuiEmptyPrompt
                  iconType="lock"
                  title={<h3>Orphan adoption disabled</h3>}
                  body={
                    <p>
                      This feature requires <code>observability.slo.ruleDedup.enabled</code> and{' '}
                      <code>observability.slo.ruleAdoption.enabled</code>. Contact your
                      administrator.
                    </p>
                  }
                />
              </EuiPanel>
            ) : featureState === 'error' ? (
              <EuiPanel data-test-subj="sloAdoption-page-error">
                <EuiEmptyPrompt
                  iconType="alert"
                  color="danger"
                  title={<h3>Unable to load adoption data</h3>}
                  body={<p>{errorMessage ?? 'Unknown error'}</p>}
                  actions={
                    <EuiButton onClick={load} data-test-subj="sloAdoption-page-error-retry" fill>
                      Retry
                    </EuiButton>
                  }
                />
              </EuiPanel>
            ) : (
              <RecoverTab
                apiClient={apiClient}
                notifications={notifications}
                initialData={initialData}
              />
            )}
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
};
