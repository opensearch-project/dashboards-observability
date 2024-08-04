/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { HashRouter, RouteComponentProps, Switch, Route } from 'react-router-dom';
import { EuiSelect, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { coreRefs } from '../../framework/core_refs';
import { ContentManagementPluginStart } from '../../../../../src/plugins/content_management/public';
import { HOME_CONTENT_AREAS, HOME_PAGE_ID } from '../../plugin_helpers/plugin_overview';

// Plugin URLs
const gettingStartedURL = 'observability-gettingStarted';
const discoverURL = 'data-explorer';
const metricsURL = 'observability-metrics';
const tracesURL = 'observability-traces-nav#/traces';

const navigateToApp = (appId: string, path: string) => {
  coreRefs?.application!.navigateToApp(appId, {
    path: `${path}`,
  });
};

export type AppAnalyticsCoreDeps = TraceAnalyticsCoreDeps;

interface HomeProps extends RouteComponentProps, AppAnalyticsCoreDeps {
  parentBreadcrumbs: ChromeBreadcrumb[];
  contentManagement: ContentManagementPluginStart;
}

interface GettingStartedConfig {
  id: string;
  order: number;
  title: string;
  description: string;
  footer: string;
  url: string;
}

export const GETTING_STARTED_CONFIG: GettingStartedConfig = {
  id: 'getting_started',
  order: 1,
  title: i18n.translate('observability.overview.card.gettingStarted.title', {
    defaultMessage: 'Add your data',
  }),
  description: 'Get started collecting and analyzing data.',
  footer: 'with Getting Started Guide',
  url: gettingStartedURL,
};

export const DISCOVER_CONFIG: GettingStartedConfig = {
  id: 'discover',
  order: 2,
  title: i18n.translate('observability.overview.card.discover.title', {
    defaultMessage: 'Discover insights',
  }),
  description: 'Uncover insights with raw data exploration.',
  footer: 'with Discover',
  url: discoverURL,
};

export const METRICS_CONFIG: GettingStartedConfig = {
  id: 'metrics',
  order: 3,
  title: i18n.translate('observability.overview.card.metrics.title', {
    defaultMessage: 'Metrics',
  }),
  description: 'Transform logs into actionable visualizations with metrics extraction.',
  footer: 'with Metrics',
  url: metricsURL,
};

export const TRACES_CONFIG: GettingStartedConfig = {
  id: 'traces',
  order: 4,
  title: i18n.translate('observability.overview.card.traces.title', {
    defaultMessage: 'Traces',
  }),
  description: 'Unveil performance bottlenecks with event flow visualization.',
  footer: 'with Traces',
  url: tracesURL,
};

const configs = [GETTING_STARTED_CONFIG, DISCOVER_CONFIG, METRICS_CONFIG, TRACES_CONFIG];

configs.map((card) => {
  coreRefs.contentManagement?.registerContentProvider({
    id: card.id,
    getContent: () => ({
      id: card.id,
      kind: 'card',
      order: card.order,
      description: card.description,
      title: card.title,
      onClick: () => navigateToApp(card.url, '#/'),
      getIcon: () => {},
      getFooter: () => {
        return (
          <EuiText size="s" textAlign="center">
            {card.footer}
          </EuiText>
        );
      },
    }),
    getTargetArea: () => HOME_CONTENT_AREAS.GET_STARTED,
  });
});

export const Home = ({ ..._props }: HomeProps) => {
  const homepage = coreRefs.contentManagement?.renderPage(HOME_PAGE_ID);
  const [ids, setIds] = useState<Array<{ value: string; text: string }>>([]);
  const [value, setValue] = useState('');
  const [_, setIsRegistered] = useState(false);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setValue(e.target.value.toString());
  };

  useEffect(() => {
    coreRefs.savedObjectsClient
      ?.find({
        type: 'dashboard',
      })
      .then((response) => {
        const dashboardIds = response.savedObjects.map((dashboard) => ({
          value: dashboard.id.toString(),
          text: dashboard.id.toString(),
        }));
        setIds(dashboardIds);
        setIsRegistered(true);
      })
      .catch((response) => {
        console.log(response);
      });
  }, []);
  useEffect(() => {
    if (ids.length > 0) {
      console.log(ids[0].value);
      coreRefs.contentManagement?.registerContentProvider({
        id: '',
        getContent: () => ({
          id: 'dashboard_content',
          kind: 'dashboard',
          order: 1000,
          input: {
            kind: 'dynamic',
            get: () => Promise.resolve(ids[0].value),
          },
        }),
        getTargetArea: () => HOME_CONTENT_AREAS.DASHBOARD,
      });
    }
  }, [ids]);

  return (
    <div>
      <HashRouter>
        <Switch>
          <Route exact path="/">
            <EuiSelect
              options={ids}
              value={value}
              hasNoInitialSelection={true}
              onChange={(e) => onChange(e)}
            />
            {homepage}
          </Route>
        </Switch>
      </HashRouter>
    </div>
  );
};
