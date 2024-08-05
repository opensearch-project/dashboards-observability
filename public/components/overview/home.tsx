/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { HashRouter, RouteComponentProps, Switch, Route } from 'react-router-dom';
import { EuiSelect, EuiText } from '@elastic/eui';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { coreRefs } from '../../framework/core_refs';
import { ContentManagementPluginStart } from '../../../../../src/plugins/content_management/public';
import { HOME_CONTENT_AREAS, HOME_PAGE_ID } from '../../plugin_helpers/plugin_overview';
import { cardConfigs, GettingStartedConfig } from './card_configs';

// Plugin IDs
const alertsPluginID = 'alerting';
const anomalyPluginID = 'anomalyDetection';

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

const registerCards = async () => {
  let alertsPluginExists = false;
  let anomalyPluginExists = false;

  try {
    const response = await fetch('../api/status', {
      headers: {
        'Content-Type': 'application/json',
        'osd-xsrf': 'true',
        'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,zh-TW;q=0.6',
        pragma: 'no-cache',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      method: 'GET',
      referrerPolicy: 'strict-origin-when-cross-origin',
      mode: 'cors',
      credentials: 'include',
    });
    const data = await response.json();

    for (const status of data.status.statuses) {
      if (status.id.includes(alertsPluginID)) {
        console.log('setting alerts plugin true');
        alertsPluginExists = true;
      }
      if (status.id.includes(anomalyPluginID)) {
        anomalyPluginExists = true;
      }
    }
  } catch (error) {
    console.error('Error checking plugin installation status:', error);
  }

  cardConfigs
    .filter((card) => {
      if (card.id === 'alerts') {
        console.log(alertsPluginExists);
        return alertsPluginExists;
      } else if (card.id === 'anomaly') {
        return anomalyPluginExists;
      }
      return true;
    })
    .map((card: GettingStartedConfig) => {
      if (card.id !== 'alerts' || (card.id && alertsPluginExists)) {
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
      }
    });
};

export const Home = ({ ..._props }: HomeProps) => {
  const homepage = coreRefs.contentManagement?.renderPage(HOME_PAGE_ID);
  const [ids, setIds] = useState<Array<{ value: string; text: string }>>([]);
  const [value, setValue] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setValue(e.target.value.toString());
  };

  useEffect(() => {
    registerCards();
  }, []);

  useEffect(() => {}, []);

  useEffect(() => {
    coreRefs.savedObjectsClient
      ?.find({
        type: 'dashboard',
      })
      .then((response) => {
        const dashboardIds = response.savedObjects.map((dashboard) => ({
          value: dashboard.id.toString(),
          text: dashboard.get('title').toString(),
        }));
        setIds(dashboardIds);
        setIsRegistered(true);
      })
      .catch((response) => {
        console.log(response);
      });
  }, [isRegistered]);

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
