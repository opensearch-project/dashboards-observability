/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiSuperDatePicker,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { OnTimeChangeProps } from '@opensearch-project/oui/src/eui_components/date_picker/super_date_picker/super_date_picker';
import React, { useEffect } from 'react';
import { useObservable } from 'react-use';
import { coreRefs } from '../../../framework/core_refs';
import { HOME_CONTENT_AREAS } from '../../../plugin_helpers/plugin_overview';
import { redirectToDashboards } from '../../getting_started/components/utils';
import { AddDashboardCallout } from './add_dashboard_callout';
import { ObservabilityDashboardManager } from './register_dashboards_controls';

export interface Props {
  // isDashboardSelected: boolean;
  // dashboardState: DashboardState;
  // setDashboardState: React.Dispatch<React.SetStateAction<DashboardState>>;
  // showFlyout: () => void;
}

export function DashboardControls({}: // isDashboardSelected,
// dashboardState,
// setDashboardState,
// showFlyout,
Props) {
  // const isDashboardSelected = ObservabilityDashboardManager.getIsDashboardSelected();
  // const dashboardState = ObservabilityDashboardManager.getDashboardState();
  // const setDashboardState = ObservabilityDashboardManager.setDashboardState;
  // const showFlyout = ObservabilityDashboardManager.getShowFlyout();

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

  const isDashboardSelected = useObservable(ObservabilityDashboardManager.isDashboardSelected$);
  const dashboardState = useObservable(ObservabilityDashboardManager.dashboardState$);
  const showFlyout = useObservable(ObservabilityDashboardManager.showFlyout$);

  useEffect(() => {
    console.log('rendered controls ');
  }, []);

  useEffect(() => {
    console.log('Props changed:', { dashboardState, isDashboardSelected });
  }, [dashboardState, isDashboardSelected]);

  const onTimeChange = (onTimeChangeProps: OnTimeChangeProps) => {
    ObservabilityDashboardManager.dashboardState$.next({
      ...dashboardState,
      startDate: onTimeChangeProps.start,
      endDate: onTimeChangeProps.end,
    });

    coreRefs.contentManagement?.updatePageSection(HOME_CONTENT_AREAS.DASHBOARD, (section) => {
      if (section && section.kind === 'dashboard') {
        return {
          ...section,
          input: {
            ...section.input,
            timeRange: { to: onTimeChangeProps.end, from: onTimeChangeProps.start },
          },
        };
      }
      return section;
    });
  };

  return isDashboardSelected ? (
    <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
      <EuiFlexItem grow={true}>
        <EuiText size="s" className="obsOverviewDashboardHeader">
          <p>
            <EuiLink onClick={() => redirectToDashboards('/view/' + dashboardState.dashboardId)}>
              {dashboardState.dashboardTitle}
            </EuiLink>
          </p>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiSuperDatePicker
              start={dashboardState.startDate}
              end={dashboardState.endDate}
              onTimeChange={onTimeChange}
              compressed
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Replace dashboard">
              <EuiButtonIcon
                iconType="gear"
                aria-label="Dashboard"
                color="primary"
                onClick={showFlyout}
                display="base"
                size="s"
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  ) : (
    <AddDashboardCallout />
  );
}
