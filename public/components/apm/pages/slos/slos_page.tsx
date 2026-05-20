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

import React, { useMemo } from 'react';
import { HashRouter, Redirect, Route, Switch } from 'react-router-dom';
import { ChromeStart, HttpStart, NotificationsStart } from '../../../../../../../src/core/public';
import { SloListingPage } from './slo_listing_page';
import { SloWizardPage } from './slo_wizard_page';
import { SloDetailPage } from './slo_detail_page';
import { SloSuggestPage } from './slo_suggest_page';
import { SloApiClient } from './slo_api_client';

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

  return (
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
  );
};
