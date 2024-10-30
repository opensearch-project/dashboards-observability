/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiSuperDatePicker,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { OnTimeChangeProps } from '@opensearch-project/oui/src/eui_components/date_picker/super_date_picker/super_date_picker';
import { useObservable } from 'react-use';
import { FormattedMessage } from '@osd/i18n/react';
import { coreRefs } from '../../../framework/core_refs';
import { HOME_CONTENT_AREAS } from '../../../plugin_helpers/plugin_overview';
import { redirectToDashboards } from '../../getting_started/components/utils';
import { AddDashboardCallout } from './add_dashboard_callout';
import { AddDataSourceCallout } from './add_datasource_callout';
import { ObsDashboardStateManager } from './obs_dashboard_state_manager';
import { SavedObjectsClientCommonFindArgs } from '../../../../../../src/plugins/data/common';
import { getWorkspaceIdFromUrl } from '../../../../../../src/core/public/utils';

const getDatasourceAttributes = async () => {
  const findOptions: SavedObjectsClientCommonFindArgs = {
    type: 'data-source',
    perPage: 1000,
  };

  const allDataSources = await coreRefs?.savedObjectsClient?.find(findOptions);
  return allDataSources?.savedObjects ?? [];
};

export function DashboardControls() {
  const [isDataSourceEmpty, setIsDataSourceEmpty] = useState<boolean | null>(null);
  const isDashboardSelected = useObservable(ObsDashboardStateManager.isDashboardSelected$);
  const dashboardState = useObservable(ObsDashboardStateManager.dashboardState$);

  useEffect(() => {
    const checkDataSource = async () => {
      const currentUrl = window.location.href;
      const workspaceId = getWorkspaceIdFromUrl(currentUrl, coreRefs?.http!.basePath.getBasePath());

      // If in a workspace, perform the data source check
      if (workspaceId) {
        const savedObjectsArray = await getDatasourceAttributes();
        setIsDataSourceEmpty(savedObjectsArray.length === 0);
      } else {
        // If not in a workspace, set to false to always show AddDashboardCallout
        setIsDataSourceEmpty(false);
      }
    };
    checkDataSource();
  }, []);

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
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  ) : isDataSourceEmpty ? (
    <AddDataSourceCallout />
  ) : (
    <AddDashboardCallout />
  );
}
