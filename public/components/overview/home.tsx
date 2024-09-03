/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiText } from '@elastic/eui';
import React, { ReactNode, useEffect, useState } from 'react';
import { HashRouter, Route, Switch } from 'react-router-dom';
import { alertsPluginID, anomalyPluginID } from '../../../common/constants/overview';
import { setNavBreadCrumbs } from '../../../common/utils/set_nav_bread_crumbs';
import { coreRefs } from '../../framework/core_refs';
import { HOME_CONTENT_AREAS, HOME_PAGE_ID } from '../../plugin_helpers/plugin_overview';
import { cardConfigs, GettingStartedConfig } from './components/card_configs';
import { DashboardControls } from './components/dashboard_controls';
import { ObservabilityDashboardManager } from './components/register_dashboards_controls';
import { SelectDashboardFlyout } from './components/select_dashboard_flyout';
import { getObservabilityDashboardsId, setObservabilityDashboardsId } from './components/utils';
import './index.scss';

export interface DashboardDictionary {
  [key: string]: {
    value: string;
    label: string;
    startDate: string;
    endDate: string;
  };
}

export const Home = () => {
  const [homePage, setHomePage] = useState<ReactNode>(<></>);
  const [dashboardsSavedObjects, setDashboardsSavedObjects] = useState<DashboardDictionary>({});
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  // const [isDashboardSelected, setIsDashboardSelected] = useState(
  //   getObservabilityDashboardsId() ? true : false
  // );
  // const [dashboardState, setDashboardState] = useState<DashboardState>({
  //   startDate: '',
  //   endDate: '',
  //   dashboardTitle: '',
  //   dashboardId: '',
  // });
  // const showFlyout = () => setIsFlyoutVisible(true);
  // const setDashboardState = ObservabilityDashboardManager.setDashboardState;
  // const setIsDashboardSelected = ObservabilityDashboardManager.setIsDashboardSelected;
  // ObservabilityDashboardManager.setShowFlyout(() => setIsFlyoutVisible(true));

  // const [isDashboardSelected, setIsDashboardSelected] = useState(false);
  // const [dashboardState, setDashboardState] = useState<DashboardState>({} as DashboardState);
  // const [showFlyout, setShowFlyout] = useState(() => () => {});

  // useEffect(() => {
  //   const subscription1 = ObservabilityDashboardManager.isDashboardSelected$.subscribe(
  //     setIsDashboardSelected
  //   );

  //   const subscription2 = ObservabilityDashboardManager.dashboardState$.subscribe(
  //     setDashboardState
  //   );

  //   const subscription3 = ObservabilityDashboardManager.showFlyout$.subscribe(setShowFlyout);
  //   return () => {
  //     subscription1.unsubscribe();
  //     subscription2.unsubscribe();
  //     subscription3.unsubscribe();
  //   };
  // }, []);

  ObservabilityDashboardManager.showFlyout$.next(() => () => setIsFlyoutVisible(true));

  const loadHomePage = () => {
    setHomePage(coreRefs.contentManagement?.renderPage(HOME_PAGE_ID));
  };

  const registerCards = async () => {
    let alertsPluginExists = false;
    let anomalyPluginExists = false;
    try {
      coreRefs.http?.get('/api/status').then((res) => {
        for (const status of res!.status.statuses) {
          if (status.id.includes(alertsPluginID)) {
            alertsPluginExists = true;
          }
          if (status.id.includes(anomalyPluginID)) {
            anomalyPluginExists = true;
          }
        }
      });
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
            onClick: () => coreRefs.application?.navigateToApp(card.url, { path: '#/' }),
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
          get: () => Promise.resolve(getObservabilityDashboardsId()),
        },
      }),
      getTargetArea: () => HOME_CONTENT_AREAS.DASHBOARD,
    });
  };

  const registerDashboardsControl = () => {
    coreRefs.contentManagement?.registerContentProvider({
      id: 'dashboards_controls',
      getContent: () => ({
        id: 'dashboards_controls',
        kind: 'custom',
        order: 1000,
        render: () => (
          <DashboardControls
          // isDashboardSelected={isDashboardSelected}
          // dashboardState={dashboardState}
          // setDashboardState={setDashboardState}
          // showFlyout={showFlyout}
          />
        ),
      }),
      getTargetArea: () => HOME_CONTENT_AREAS.SELECTOR,
    });
  };
  // const registerDashboard = () => {
  //   coreRefs.contentManagement?.registerContentProvider({
  //     id: 'dashboard_content',
  //     getContent: () => ({
  //       id: 'dashboard_content',
  //       kind: 'dashboard',
  //       order: 1000,
  //       input: {
  //         kind: 'dynamic',
  //         get: () => Promise.resolve(getObservabilityDashboardsId()),
  //       },
  //     }),
  //     getTargetArea: () => HOME_CONTENT_AREAS.DASHBOARD,
  //   });

  //   const defaultDashboard = getObservabilityDashboardsId();
  //   console.log('defaultDashboard: ', defaultDashboard);
  //   console.log('dashboardsSavedObjects: ', dashboardsSavedObjects);
  //   console.log(
  //     'dashboardsSavedObjects[defaultDashboard]: ',
  //     dashboardsSavedObjects[defaultDashboard]
  //   );
  //   if (dashboardsSavedObjects && defaultDashboard && dashboardsSavedObjects[defaultDashboard]) {
  //     setDashboardState({
  //       dashboardTitle: dashboardsSavedObjects[defaultDashboard].label,
  //       dashboardId: defaultDashboard,
  //       startDate: dashboardsSavedObjects[defaultDashboard].startDate,
  //       endDate: dashboardsSavedObjects[defaultDashboard].endDate,
  //     });
  //     setIsDashboardSelected(true);
  //   } else {
  //     console.log('register dashboard false');
  //     setIsDashboardSelected(false);
  //   }
  // };

  const loadDashboardsState = () => {
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

        setDashboardsSavedObjects(savedDashboards);
        const defaultDashboard = getObservabilityDashboardsId();

        if (defaultDashboard in savedDashboards) {
          // setDashboardState({
          //   dashboardTitle: savedDashboards[defaultDashboard].label,
          //   dashboardId: defaultDashboard,
          //   startDate: savedDashboards[defaultDashboard].startDate ?? 'now-7d',
          //   endDate: savedDashboards[defaultDashboard].endDate ?? 'now',
          // });
          // setIsDashboardSelected(true);
          ObservabilityDashboardManager.dashboardState$.next({
            dashboardTitle: savedDashboards[defaultDashboard].label,
            dashboardId: defaultDashboard,
            startDate: savedDashboards[defaultDashboard].startDate ?? 'now-7d',
            endDate: savedDashboards[defaultDashboard].endDate ?? 'now',
          });
          ObservabilityDashboardManager.isDashboardSelected$.next(true);
          console.log('updated dashboard state');
        } else {
          setObservabilityDashboardsId(null);
          // setDashboardState({
          //   startDate: '',
          //   endDate: '',
          //   dashboardTitle: '',
          //   dashboardId: '',
          // });
          // console.log('load dashboards false');
          // setIsDashboardSelected(false);
          ObservabilityDashboardManager.dashboardState$.next({
            startDate: '',
            endDate: '',
            dashboardTitle: '',
            dashboardId: '',
          });
          console.log('load dashboards false');
          ObservabilityDashboardManager.isDashboardSelected$.next(false);
        }
      })
      .catch((error) => {
        console.error('Error fetching dashboards:', error);
      });
    // registerDashboard();
    // registerDashboardsControl();
    // registerCards();
    // loadHomePage();
  };

  const reloadDashboardComponents = () => {
    registerDashboard();
    registerDashboardsControl();
  };

  const flyout = isFlyoutVisible && (
    <SelectDashboardFlyout
      closeFlyout={() => setIsFlyoutVisible(false)}
      // isDashboardSelected={isDashboardSelected}
      // setIsDashboardSelected={setIsDashboardSelected}
      dashboardsSavedObjects={dashboardsSavedObjects}
      registerDashboard={loadDashboardsState}
    />
  );

  // const dashboardControls = () => {
  //   return isDashboardSelected ? (
  //     <DashboardControls
  //       dashboardState={dashboardState}
  //       setDashboardState={setDashboardState}
  //       showFlyout={showFlyout}
  //     />
  //   ) : (
  //     <AddDashboardCallout showFlyout={showFlyout} />
  //   );
  // };

  // useEffect(() => {
  //   setDashboardControls(dashboardControls);
  // }, [isDashboardSelected]);

  useEffect(() => {
    registerCards();
    reloadDashboardComponents();
    loadHomePage();
    // const defaultDashboard = getObservabilityDashboardsId();
    // if (defaultDashboard) {
    //   setIsDashboardSelected(true);
    //   registerDashboard();
    // }
  }, [dashboardsSavedObjects]);

  useEffect(() => {
    setNavBreadCrumbs(
      [],
      [
        {
          text: 'Observability overview',
          href: '#/',
        },
      ]
    );
    loadDashboardsState();
    // registerCards();
    // const defaultDashboard = getObservabilityDashboardsId();
    // if (defaultDashboard) {
    //   setIsDashboardSelected(true);
    //   registerDashboard();
    // }
    // setDashboardControls(dashboardControls);
  }, []);

  // useEffect(() => {
  //   console.log('re-registered content', isDashboardSelected, dashboardState);
  // }, [isDashboardSelected, dashboardState]);

  return (
    <div>
      <HashRouter>
        <Switch>
          <Route exact path="/">
            <div>
              {homePage}
              {flyout}
            </div>
          </Route>
        </Switch>
      </HashRouter>
    </div>
  );
};
