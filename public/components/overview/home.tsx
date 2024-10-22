/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiPopover,
  EuiContextMenu,
  EuiIcon,
  EuiButtonEmpty,
  EuiToolTip,
} from '@elastic/eui';
import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { HashRouter, Route, Switch } from 'react-router-dom';
import { useObservable } from 'react-use';
import { EMPTY } from 'rxjs';
import {
  observabilityOverviewTitle,
  observabilityOverviewTitleWithUseCase,
} from '../../../common/constants/shared';
import { DashboardSavedObjectsType } from '../../../common/types/overview';
import { setNavBreadCrumbs } from '../../../common/utils/set_nav_bread_crumbs';
import { coreRefs } from '../../framework/core_refs';
import {
  GET_STARTED_SECTION,
  HOME_CONTENT_AREAS,
  HOME_PAGE_ID,
  SECTIONS,
} from '../../plugin_helpers/plugin_overview';
import { cardConfigs, GettingStartedConfig } from './components/card_configs';
import { DashboardControls } from './components/dashboard_controls';
import { ObsDashboardStateManager } from './components/obs_dashboard_state_manager';
import { SelectDashboardFlyout } from './components/select_dashboard_flyout';
import {
  getObservabilityDashboardsId,
  setObservabilityDashboardsId,
  getObservabilityDashboardsShowCards,
  setObservabilityDashboardsShowCards,
} from './components/utils';
import './index.scss';
import { OBSERVABILITY_USE_CASE_ID } from '../../../../../src/core/public';
import { HeaderControlledComponentsWrapper } from '../../../public/plugin_helpers/plugin_headerControl';
import { getOverviewPage } from '../../../common/utils';

export const Home = () => {
  const [homePage, setHomePage] = useState<ReactNode>(<></>);
  const [dashboardsSavedObjects, setDashboardsSavedObjects] = useState<DashboardSavedObjectsType>(
    {}
  );
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [showGetStarted, setShowGetStarted] = useState<boolean | null>(null); // Initial null state

  // When workspace enabled, only workspace owner can update observability:defaultDashboard.
  const isWorkspaceOwner = useMemo(() => {
    const isCurrentWorkspaceOwner = coreRefs.workspaces?.currentWorkspace$.getValue()?.owner;
    const isDashboardAdmin =
      coreRefs.application?.capabilities?.dashboards?.isDashboardAdmin !== false;
    return isCurrentWorkspaceOwner || isDashboardAdmin;
  }, [coreRefs.workspaces, coreRefs.application?.capabilities]);

  ObsDashboardStateManager.showFlyout$.next(() => () => setIsFlyoutVisible(true));

  const loadHomePage = () => {
    setHomePage(coreRefs.contentManagement?.renderPage(HOME_PAGE_ID));
  };

  const togglePopover = () => setIsPopoverOpen(!isPopoverOpen);
  const closePopover = () => setIsPopoverOpen(false);

  const loadDashboardState = () => {
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
        }, {} as DashboardSavedObjectsType);

        setDashboardsSavedObjects(savedDashboards);
        const defaultDashboard = getObservabilityDashboardsId();

        if (defaultDashboard in savedDashboards) {
          ObsDashboardStateManager.dashboardState$.next({
            dashboardTitle: savedDashboards[defaultDashboard].label,
            dashboardId: defaultDashboard,
            startDate: savedDashboards[defaultDashboard].startDate ?? 'now-7d',
            endDate: savedDashboards[defaultDashboard].endDate ?? 'now',
          });
          ObsDashboardStateManager.isDashboardSelected$.next(true);
        } else {
          if (isWorkspaceOwner) {
            setObservabilityDashboardsId(null);
            ObsDashboardStateManager.dashboardState$.next({
              startDate: '',
              endDate: '',
              dashboardTitle: '',
              dashboardId: '',
            });
            ObsDashboardStateManager.isDashboardSelected$.next(false);
          }
        }
      })
      .catch((error) => {
        console.error('Error fetching dashboards:', error);
      });
  };

  const flyout = isFlyoutVisible && (
    <SelectDashboardFlyout
      closeFlyout={() => setIsFlyoutVisible(false)}
      dashboardsSavedObjects={dashboardsSavedObjects}
      reloadPage={loadDashboardState}
    />
  );

  useEffect(() => {
    const fetchShowCards = async () => {
      const showCards = await getObservabilityDashboardsShowCards();
      setShowGetStarted(showCards);

      if (showCards) {
        getOverviewPage().createSection(GET_STARTED_SECTION);
      } else {
        getOverviewPage().removeSection(SECTIONS.GET_STARTED);
      }
    };

    fetchShowCards();
    loadDashboardState();
  }, []);

  const renderHeaderButton = () => {
    if (showGetStarted === null) {
      return (
        <EuiButtonIcon
          iconType="gear"
          aria-label="Loading..."
          color="primary"
          display="base"
          size="s"
          isDisabled={true}
        />
      );
    }

    const contextMenuItems = [
      {
        name: showGetStarted
          ? 'Hide Get started with Observability'
          : 'Show Get started with Observability',
        icon: <EuiIcon type={showGetStarted ? 'eyeClosed' : 'eye'} />,
        onClick: async () => {
          const updatedShowCards = !showGetStarted;
          await setObservabilityDashboardsShowCards(updatedShowCards);
          setShowGetStarted(updatedShowCards);
          closePopover();

          if (updatedShowCards) {
            console.log('Called createSection');
            getOverviewPage().createSection(GET_STARTED_SECTION);
          } else {
            getOverviewPage().removeSection(SECTIONS.GET_STARTED);
          }
        },
      },
      {
        name: 'Select a dashboard',
        icon: <EuiIcon type="dashboardApp" />,
        onClick: () => {
          setIsFlyoutVisible(true);
          closePopover();
        },
      },
    ];

    return (
      <>
        {showGetStarted && (
          <EuiButtonEmpty
            size="s"
            color="primary"
            iconSide="right"
            iconType="cross"
            onClick={() => {
              setShowGetStarted(false);
              setObservabilityDashboardsShowCards(false);
              getOverviewPage().removeSection(SECTIONS.GET_STARTED);
            }}
          >
            Dismiss Get started
          </EuiButtonEmpty>
        )}
        <EuiToolTip content="Page settings">
          <EuiPopover
            button={
              <EuiButtonIcon
                iconType="gear"
                aria-label="Page settings"
                color="primary"
                onClick={togglePopover}
                display="base"
                size="s"
              />
            }
            isOpen={isPopoverOpen}
            closePopover={closePopover}
            panelPaddingSize="none"
          >
            <EuiContextMenu
              size="s"
              initialPanelId={0}
              panels={[
                {
                  id: 0,
                  items: contextMenuItems,
                },
              ]}
            />
          </EuiPopover>
        </EuiToolTip>
      </>
    );
  };

  const registerCards = async () => {
    try {
      cardConfigs.forEach((card: GettingStartedConfig) => {
        coreRefs.contentManagement?.registerContentProvider({
          id: card.id,
          getContent: () => ({
            id: card.id,
            kind: 'card',
            order: card.order,
            description: card.description,
            title: card.title,
            onClick: () => coreRefs.application?.navigateToApp(card.url, { path: card.path }),
            getFooter: () => card.footer,
            getIcon: () => card.icon,
            cardProps: {
              className: 'usecaseOverviewGettingStartedCard',
            },
          }),
          getTargetArea: () => HOME_CONTENT_AREAS.GET_STARTED,
        });
      });
    } catch (error) {
      console.error('Error registering cards:', error);
    }
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
        render: () => <DashboardControls />,
      }),
      getTargetArea: () => HOME_CONTENT_AREAS.SELECTOR,
    });
  };

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
        }, {} as DashboardSavedObjectsType);

        setDashboardsSavedObjects(savedDashboards);
        const defaultDashboard = getObservabilityDashboardsId();

        if (defaultDashboard in savedDashboards) {
          ObsDashboardStateManager.dashboardState$.next({
            dashboardTitle: savedDashboards[defaultDashboard].label,
            dashboardId: defaultDashboard,
            startDate: savedDashboards[defaultDashboard].startDate ?? 'now-7d',
            endDate: savedDashboards[defaultDashboard].endDate ?? 'now',
          });
          ObsDashboardStateManager.isDashboardSelected$.next(true);
        } else {
          if (isWorkspaceOwner) {
            setObservabilityDashboardsId(null);
            ObsDashboardStateManager.dashboardState$.next({
              startDate: '',
              endDate: '',
              dashboardTitle: '',
              dashboardId: '',
            });
            ObsDashboardStateManager.isDashboardSelected$.next(false);
          }
        }
      })
      .catch((error) => {
        console.error('Error fetching dashboards:', error);
      });
  };

  useEffect(() => {
    registerCards();
    registerDashboard();
    registerDashboardsControl();
    loadHomePage();
  }, [dashboardsSavedObjects]);

  const currentNavGroup = useObservable(coreRefs?.chrome?.navGroup.getCurrentNavGroup$() || EMPTY);
  const isObservabilityUseCase = currentNavGroup?.id === OBSERVABILITY_USE_CASE_ID;

  useEffect(() => {
    setNavBreadCrumbs(
      [],
      [
        {
          text: isObservabilityUseCase
            ? observabilityOverviewTitle
            : observabilityOverviewTitleWithUseCase,
          href: '#/',
        },
      ]
    );
    loadDashboardsState();
  }, [isObservabilityUseCase]);

  return (
    <div>
      <HeaderControlledComponentsWrapper
        components={[renderHeaderButton()]}
        description={showGetStarted ? 'Get started with Observability' : undefined}
      />
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
