/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { HashRouter, RouteComponentProps, Switch, Route } from 'react-router-dom';
import { EuiText } from '@elastic/eui';
import moment from 'moment';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { coreRefs } from '../../framework/core_refs';
import { ContentManagementPluginStart } from '../../../../../src/plugins/content_management/public';
import { HOME_CONTENT_AREAS, HOME_PAGE_ID } from '../../plugin_helpers/plugin_overview';
import { cardConfigs, GettingStartedConfig } from './components/card_configs';
import { uiSettingsService } from '../../../common/utils';
import { AddDashboardCallout } from './components/add_dashboard_callout';
import { DashboardControls } from './components/dashboard_controls';
import { SelectDashboardFlyout } from './components/select_dashboard_flyout';

// Plugin IDs
const alertsPluginID = 'alerting';
const anomalyPluginID = 'anomalyDetection';

const uiSettingsKey = 'observability:defaultDashboard';

interface HomeProps extends RouteComponentProps {
  parentBreadcrumbs: ChromeBreadcrumb[];
  contentManagement: ContentManagementPluginStart;
}

let showFlyout: { (): void; (): void; (): void };
const wrapper = {
  dashboardSelected: false,
};
let startDate: string;
let setStartDate: (start: string) => void;
let endDate: string;
let setEndDate: (end: string) => void;
let dashboardTitle: string;
let setDashboardTitle: (arg0: string) => void;

const navigateToApp = (appId: string, path: string) => {
  coreRefs?.application!.navigateToApp(appId, {
    path: `${path}`,
  });
};

coreRefs.contentManagement?.registerContentProvider({
  id: 'custom_content',
  getContent: () => ({
    id: 'custom_content',
    kind: 'custom',
    order: 1500,
    render: () =>
      wrapper.dashboardSelected ? (
        <DashboardControls
          dashboardTitle={dashboardTitle}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          showModal={showFlyout}
        />
      ) : (
        <AddDashboardCallout showFlyout={showFlyout} navigateToApp={navigateToApp} />
      ),
  }),
  getTargetArea: () => HOME_CONTENT_AREAS.SELECTOR,
});

export interface DashboardDictionary {
  [key: string]: {
    value: string;
    label: string;
    startDate: string;
    endDate: string;
  };
}

export const Home = ({ ..._props }: HomeProps) => {
  const homepage = coreRefs.contentManagement?.renderPage(HOME_PAGE_ID);
  const [_, setIsRegistered] = useState(false);
  const [dashboards, setDashboards] = useState<DashboardDictionary>({});
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  [startDate, setStartDate] = useState(moment().toISOString());
  [endDate, setEndDate] = useState(moment().toISOString());
  [dashboardTitle, setDashboardTitle] = useState('');

  showFlyout = () => setIsFlyoutVisible(true);

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
          return alertsPluginExists;
        } else if (card.id === 'anomaly') {
          return anomalyPluginExists;
        }
        return true;
      })
      .forEach((card: GettingStartedConfig) => {
        coreRefs.contentManagement?.registerContentProvider({
          id: card.id,
          getContent: () => ({
            id: card.id,
            kind: 'card',
            order: card.order,
            description: card.description,
            title: card.title,
            onClick: () => navigateToApp(card.url, '#/'),
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
  };

  const registerDashboard = () => {
    coreRefs.contentManagement?.registerContentProvider({
      id: 'dashboard_content',
      getContent: () => ({
        id: 'dashboard_content',
        kind: 'dashboard',
        order: 1000,
        input: {
          kind: 'dynamic',
          get: () => Promise.resolve(uiSettingsService.get(uiSettingsKey)),
        },
      }),
      getTargetArea: () => HOME_CONTENT_AREAS.DASHBOARD,
    });
    setIsRegistered(true);
    const defaultDashboard = uiSettingsService.get(uiSettingsKey);
    if (dashboards && defaultDashboard && dashboards[defaultDashboard]) {
      setDashboardTitle(dashboards[defaultDashboard].label);
      setStartDate(dashboards[defaultDashboard].startDate);
      setEndDate(dashboards[defaultDashboard].endDate);
    }
  };

  useEffect(() => {
    coreRefs.savedObjectsClient
      ?.find({
        type: 'dashboard',
      })
      .then((response) => {
        const savedDashboards = response.savedObjects.reduce((acc, savedDashboard) => {
          const dashboardAttributes = savedDashboard.attributes as {
            title: string;
            timeFrom: string;
            timeTo: string;
          };
          const id = savedDashboard.id.toString();
          acc[id] = {
            value: id,
            label: dashboardAttributes.title,
            startDate: dashboardAttributes.timeFrom,
            endDate: dashboardAttributes.timeTo,
          };
          return acc;
        }, {} as DashboardDictionary);
        setDashboards(savedDashboards);
        const defaultDashboard = uiSettingsService.get(uiSettingsKey);
        if (defaultDashboard && dashboards[defaultDashboard]) {
          setDashboardTitle(dashboards[defaultDashboard].label);
        }
      })
      .catch((error) => {
        console.error('Error fetching dashboards:', error);
      });
  }, []);

  useEffect(() => {
    registerCards();
    const defaultDashboard = uiSettingsService.get(uiSettingsKey);
    if (defaultDashboard) {
      wrapper.dashboardSelected = true;
      registerDashboard();
    }
  }, [dashboards]);

  const flyout = isFlyoutVisible && (
    <SelectDashboardFlyout
      closeFlyout={() => setIsFlyoutVisible(false)}
      wrapper={wrapper}
      dashboards={dashboards}
      registerDashboard={registerDashboard}
    />
  );

  return (
    <div>
      <HashRouter>
        <Switch>
          <Route exact path="/">
            {homepage}
            {flyout}
          </Route>
        </Switch>
      </HashRouter>
    </div>
  );
};
