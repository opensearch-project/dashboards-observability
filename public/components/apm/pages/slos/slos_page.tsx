/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Root mount for the SLO/SLI app. Hash routes:
 *   /slos                       — listing
 *   /slos/create                — wizard template selector
 *   /slos/create/:templateId    — wizard prefilled with the named template
 *   /slos/:id                   — detail view
 */

import React, { useMemo } from 'react';
import { HashRouter, Redirect, Route, Switch } from 'react-router-dom';
import type {
  ChromeStart,
  HttpStart,
  NotificationsStart,
} from '../../../../../../../src/core/public';
import { SloApiClient } from './slo_api_client';
import { SloListingPage } from './slo_listing_page';
import { SloWizardPage } from './slo_wizard_page';
import { SloDetailPage } from './slo_detail_page';

export interface SlosPageProps {
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
  /**
   * Trace Analytics DepsStart bag spread through by the ApmConfigProvider
   * wrapper in `app.tsx`. Shape matches the ApmServicesProps / ApmApplicationMapProps
   * contract — declare only the field we actually use.
   */
  DepsStart?: { data?: unknown };
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
            chrome={chrome}
            notifications={notifications}
            parentBreadcrumb={parentBreadcrumb}
          />
        </Route>
        <Route exact path={['/slos/create', '/slos/create/:templateId']}>
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
        <Route path="*">
          <Redirect to="/slos" />
        </Route>
      </Switch>
    </HashRouter>
  );
};
