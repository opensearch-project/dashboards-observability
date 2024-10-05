/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiSuperDatePicker,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { OnTimeChangeProps } from '@opensearch-project/oui/src/eui_components/date_picker/super_date_picker/super_date_picker';
import React from 'react';
import { useObservable } from 'react-use';
import { FormattedMessage } from '@osd/i18n/react';
import { coreRefs } from '../../../framework/core_refs';
import { HOME_CONTENT_AREAS } from '../../../plugin_helpers/plugin_overview';
import { redirectToDashboards } from '../../getting_started/components/utils';
import { AddDashboardCallout } from './add_dashboard_callout';
import { ObsDashboardStateManager } from './obs_dashboard_state_manager';

export function DashboardControls() {
  const isDashboardSelected = useObservable(ObsDashboardStateManager.isDashboardSelected$);
  const dashboardState = useObservable(ObsDashboardStateManager.dashboardState$);
  const showFlyout = useObservable(ObsDashboardStateManager.showFlyout$);

  const onTimeChange = (onTimeChangeProps: OnTimeChangeProps) => {
    ObsDashboardStateManager.dashboardState$.next({
      ...dashboardState!,
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
    <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="spaceBetween">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiText size="m" className="obsOverviewDashboardHeader">
              <h4>{dashboardState?.dashboardTitle}</h4>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={
                <FormattedMessage
                  id="observability.dashboard.popout.tooltip"
                  defaultMessage="Go to dashboard"
                />
              }
            >
              <EuiLink
                onClick={() => redirectToDashboards('/view/' + dashboardState?.dashboardId)}
                external={true}
              >
                <EuiIcon type="popout" />
              </EuiLink>
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiSuperDatePicker
              start={dashboardState?.startDate}
              end={dashboardState?.endDate}
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
