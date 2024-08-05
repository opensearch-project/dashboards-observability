/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { HashRouter, RouteComponentProps, Switch, Route } from 'react-router-dom';
import {
  EuiText,
  EuiButton,
  EuiAccordion,
  EuiModal,
  EuiModalHeader,
  EuiModalBody,
  EuiModalFooter,
  EuiComboBox,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSuperDatePicker,
  EuiButtonIcon,
} from '@elastic/eui';
import moment from 'moment';
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

let showModal;
let closeModal;
let dashboardSelected;
let setDashboardSelected;
let startDate;
let setStartDate;

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
          {dashboardSelected ? (
            <EuiFlexGroup gutterSize="s" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiSuperDatePicker
                  start={startDate}
                  end={startDate}
                  onTimeChange={({ start }) => {
                    setStartDate(start);
                  }}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  iconType="gear"
                  aria-label="Dashboard"
                  color="success"
                  onClick={showModal}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : (
            <>
              <EuiText>
                <p>Please select your observability overview dashboard.</p>
              </EuiText>
              <EuiButton onClick={showModal}>Add</EuiButton>
            </>
          )}
        </EuiAccordion>
      </EuiPanel>
    ),
  }),
  getTargetArea: () => HOME_CONTENT_AREAS.SELECTOR,
});

export const Home = ({ ..._props }: HomeProps) => {
  const homepage = coreRefs.contentManagement?.renderPage(HOME_PAGE_ID);
  const [_dashboardIdsState, setDashboardIdsState] = useState<
    Array<{ value: string; text: string }>
  >([]);
  const [_isRegistered, setIsRegistered] = useState(false);

  const [dashboardIds, setDashboardIds] = useState<Array<{ value: string; label: string }>>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedOptionsState, setSelectedOptionsState] = useState([]);
  [dashboardSelected, setDashboardSelected] = useState(false);
  [startDate, setStartDate] = useState(moment().toISOString());

  showModal = () => setIsModalVisible(true);
  closeModal = () => setIsModalVisible(false);

  const onComboBoxChange = (options) => {
    setSelectedOptionsState(options);
  };

  const onClickAdd = () => {
    if (selectedOptionsState.length > 0) {
      registerDashboard(selectedOptionsState[0].value);
      setDashboardSelected(true);
    }
    closeModal();
  };

  const registerDashboard = (dashboardId: string) => {
    coreRefs.contentManagement?.registerContentProvider({
      id: 'dashboard_content',
      getContent: () => ({
        id: 'dashboard_content',
        kind: 'dashboard',
        order: 1000,
        input: {
          kind: 'dynamic',
          get: () => Promise.resolve(dashboardId),
        },
      }),
      getTargetArea: () => HOME_CONTENT_AREAS.DASHBOARD,
    });
  };

  useEffect(() => {
    registerCards();
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
        setIsRegistered(true);
      })
      .catch((error) => {
        console.error('Error fetching dashboards:', error);
      });
  }, []);

  let modal;

  if (isModalVisible) {
    modal = (
      <EuiModal onClose={closeModal}>
        <EuiModalHeader>
          <div>Select Dashboard</div>
        </EuiModalHeader>
        <EuiModalBody>
          <EuiComboBox
            placeholder="Select a dashboard"
            singleSelection={{ asPlainText: true }}
            options={dashboardIds}
            selectedOptions={selectedOptionsState}
            onChange={onComboBoxChange}
          />
        </EuiModalBody>
        <EuiModalFooter>
          <EuiButton onClick={closeModal}>Cancel</EuiButton>
          <EuiButton onClick={onClickAdd} fill>
            Add
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>
    );
  }

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
