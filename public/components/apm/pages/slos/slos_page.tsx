/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Root mount for the SLO/SLI app under Application Monitoring.
 * Hash routes:
 *   /slos                       — listing
 *   /slos/create                — template selector (picks a template, then opens wizard)
 *   /slos/create/:templateId    — wizard prefilled from the named template
 *   /slos/:id                   — detail view
 */

import React, { useEffect, useMemo } from 'react';
import { EuiCallOut, EuiCode, EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { HashRouter, Redirect, Route, Switch } from 'react-router-dom';
import { ChromeStart, HttpStart, NotificationsStart } from '../../../../../../../src/core/public';
import { SloListingPage } from './slo_listing_page';
import { SloWizardPage } from './slo_wizard_page';
import { SloDetailPage } from './slo_detail_page';
import { SloSuggestPage } from './slo_suggest_page';
import { SloApiClient } from './slo_api_client';

/**
 * Catches render-time errors anywhere in the SLO router tree so a single
 * panel/page failing to render doesn't unmount the entire APM app. Without
 * this, a stray `undefined.foo` deep inside `SloDetailPage` would propagate
 * up to the embedding `apm/pages/index` mount and the user would see a blank
 * APM screen with a console-only error.
 *
 * Class component because React's error-boundary API still requires
 * `getDerivedStateFromError` / `componentDidCatch` — there is no functional
 * equivalent in this React 18 line.
 */
interface ErrorBoundaryState {
  error: Error | null;
}

class SloRouterErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[slo] Unhandled render error in SLO router', error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 24 }}>
          <EuiCallOut
            color="danger"
            iconType="alert"
            title={i18n.translate('observability.apm.slo.router.errorBoundaryTitle', {
              defaultMessage: 'The SLO/SLI page hit an unexpected error',
            })}
            data-test-subj="sloRouterErrorBoundary"
          >
            <EuiText size="s">
              {i18n.translate('observability.apm.slo.router.errorBoundaryBody', {
                defaultMessage:
                  'Reloading the page typically clears this. If it persists, file an issue with the error message below.',
              })}
            </EuiText>
            <EuiSpacer size="s" />
            <EuiCode language="text">
              {String(this.state.error?.message ?? this.state.error)}
            </EuiCode>
          </EuiCallOut>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface SlosPageProps {
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
  /** Injected by app.tsx via spread; consumed by the ApmConfigProvider wrapper. */
  DepsStart?: { data?: unknown };
  [key: string]: unknown;
}

export const SlosPage: React.FC<SlosPageProps> = ({
  http,
  chrome,
  notifications,
  parentBreadcrumb,
}) => {
  const apiClient = useMemo(() => new SloApiClient(http), [http]);

  // Show a "Beta" badge in the top chrome bar while the SLO/SLI app is
  // mounted; clear it on unmount so it doesn't leak into other apps.
  // Mirrors the pattern in components/alerting/home.tsx — same beaker icon,
  // same chrome.setBadge call, same cleanup contract.
  useEffect(() => {
    if (!chrome?.setBadge) return undefined;
    chrome.setBadge({
      text: i18n.translate('observability.apm.slo.betaBadge', {
        defaultMessage: 'Beta',
      }),
      tooltip: i18n.translate('observability.apm.slo.betaBadgeTooltip', {
        defaultMessage:
          'SLO/SLI is in beta. Features may change and some functionality is still evolving.',
      }),
      iconType: 'beaker',
    });
    return () => {
      chrome.setBadge?.(undefined);
    };
  }, [chrome]);

  return (
    <SloRouterErrorBoundary>
      <HashRouter>
        <Switch>
          <Route exact path="/slos">
            <SloListingPage
              apiClient={apiClient}
              http={http}
              chrome={chrome}
              notifications={notifications}
              parentBreadcrumb={parentBreadcrumb}
            />
          </Route>
          <Route exact path="/slos/suggest">
            <SloSuggestPage
              apiClient={apiClient}
              http={http}
              chrome={chrome}
              notifications={notifications}
              parentBreadcrumb={parentBreadcrumb}
            />
          </Route>
          <Route exact path="/slos/create">
            <SloWizardPage
              apiClient={apiClient}
              chrome={chrome}
              notifications={notifications}
              parentBreadcrumb={parentBreadcrumb}
            />
          </Route>
          <Route exact path="/slos/create/:templateId">
            <SloWizardPage
              apiClient={apiClient}
              chrome={chrome}
              notifications={notifications}
              parentBreadcrumb={parentBreadcrumb}
            />
          </Route>
          <Route exact path="/slos/:id">
            <SloDetailPage
              apiClient={apiClient}
              chrome={chrome}
              notifications={notifications}
              parentBreadcrumb={parentBreadcrumb}
            />
          </Route>
          <Route>
            <Redirect to="/slos" />
          </Route>
        </Switch>
      </HashRouter>
    </SloRouterErrorBoundary>
  );
};
