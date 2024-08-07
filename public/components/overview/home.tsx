/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { HashRouter, RouteComponentProps, Switch, Route } from 'react-router-dom';
import { EuiText, EuiAccordion, EuiPanel, EuiComboBoxOptionOption } from '@elastic/eui';
import moment from 'moment';
import { TraceAnalyticsCoreDeps } from '../trace_analytics/home';
import { ChromeBreadcrumb } from '../../../../../src/core/public';
import { coreRefs } from '../../framework/core_refs';
import { ContentManagementPluginStart } from '../../../../../src/plugins/content_management/public';
import { HOME_CONTENT_AREAS, HOME_PAGE_ID } from '../../plugin_helpers/plugin_overview';
import { cardConfigs, GettingStartedConfig } from './components/card_configs';
import { uiSettingsService } from '../../../common/utils';
import { AddDashboardCallout } from './components/add_dashboard_callout';
import { DatePicker } from './components/date_picker';
import { SelectDashboardModal } from './components/select_dashboard_modal';

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
          getIcon: () => {},
          getFooter: () => {
            return (
              <EuiText size="s" textAlign="left">
                {card.footer}
              </EuiText>
            );
          },
        }),
        getTargetArea: () => HOME_CONTENT_AREAS.GET_STARTED,
      });
    });
};

export const Home = ({ ..._props }: HomeProps) => {
  const homepage = coreRefs.contentManagement?.renderPage(HOME_PAGE_ID);
  const [_dashboardIdsState, setDashboardIdsState] = useState<
    Array<{ value: string; text: string }>
  >([]);
  const [_isRegistered, setIsRegistered] = useState(false);

  const [dashboardIds, setDashboardIds] = useState<Array<{ value: string; label: string }>>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedOptionsState, setSelectedOptionsState] = useState<EuiComboBoxOptionOption[]>([]);
  const dashboardSelected = useRef(false);
  const [startDate, setStartDate] = useState(moment().toISOString());

  const showModal = () => setIsModalVisible(true);
  const closeModal = () => setIsModalVisible(false);

  const onComboBoxChange = (options: EuiComboBoxOptionOption[]) => {
    setSelectedOptionsState(options);
  };

  const onClickAdd = () => {
    if (selectedOptionsState.length > 0) {
      dashboardSelected.current = true;
      uiSettingsService
        .set('observability:defaultDashboard', selectedOptionsState[0].value)
        .then(registerDashboard);
    }
    closeModal();
  };

  const registerSelect = () => {
    coreRefs.contentManagement?.registerContentProvider({
      id: 'custom_content',
      getContent: () => ({
        id: 'custom_content',
        kind: 'custom',
        order: 1500,
        render: () => (
          <EuiPanel paddingSize="m" hasShadow={false} hasBorder>
            <EuiAccordion
              id="accordion1"
              buttonContent={
                <EuiText>
                  <h3>Select Dashboard</h3>
                </EuiText>
              }
              paddingSize="m"
              initialIsOpen={true}
            >
              {dashboardSelected.current ? (
                <DatePicker
                  startDate={startDate}
                  setStartDate={setStartDate}
                  showModal={showModal}
                />
              ) : (
                <AddDashboardCallout showModal={showModal} />
              )}
            </EuiAccordion>
          </EuiPanel>
        ),
      }),
      getTargetArea: () => HOME_CONTENT_AREAS.SELECTOR,
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
          get: () => Promise.resolve(uiSettingsService.get('observability:defaultDashboard')),
        },
      }),
      getTargetArea: () => HOME_CONTENT_AREAS.DASHBOARD,
    });
    setIsRegistered(true);
  };

  useEffect(() => {
    registerCards();
    if (uiSettingsService.get('observability:defaultDashboard')) {
      dashboardSelected.current = true;
      registerDashboard();
    }
    registerSelect();
  }, []);

  useEffect(() => {
    coreRefs.savedObjectsClient
      ?.find({
        type: 'dashboard',
      })
      .then((response) => {
        const dashboards = response.savedObjects.map((dashboard) => ({
          value: dashboard.id.toString(),
          text: dashboard.get('title').toString(),
          label: dashboard.attributes.title,
        }));
        setDashboardIdsState(dashboards);
        setDashboardIds(dashboards);
      })
      .catch((error) => {
        console.error('Error fetching dashboards:', error);
      });
  }, []);

  const modal = isModalVisible && (
    <SelectDashboardModal
      closeModal={closeModal}
      dashboardSelected={dashboardSelected}
      dashboardIds={dashboardIds}
      selectedOptionsState={selectedOptionsState}
      onComboBoxChange={onComboBoxChange}
      onClickAdd={onClickAdd}
    />
  );

  return (
    <div>
      <HashRouter>
        <Switch>
          <Route exact path="/">
            {homepage}
            {modal}
          </Route>
        </Switch>
      </HashRouter>
    </div>
  );
};
