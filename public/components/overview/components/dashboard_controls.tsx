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
import React from 'react';
import { OnTimeChangeProps } from '@opensearch-project/oui/src/eui_components/date_picker/super_date_picker/super_date_picker';
import { coreRefs } from '../../../framework/core_refs';
import { HOME_CONTENT_AREAS } from '../../../plugin_helpers/plugin_overview';
import { redirectToDashboards } from '../../getting_started/components/utils';

export interface Props {
  dashboardTitle: string;
  dashboardId: string;
  startDate: string;
  endDate: string;
  setStartDate: (start: string) => void;
  setEndDate: (end: string) => void;
  showFlyout: () => void;
}

export function DashboardControls(props: Props) {
  const onTimeChange = (onTimeChangeProps: OnTimeChangeProps) => {
    props.setStartDate(onTimeChangeProps.start);
    props.setEndDate(onTimeChangeProps.end);

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

  return (
    <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
      <EuiFlexItem grow={true}>
        <EuiText size="s" className="obsOverviewDashboardHeader">
          <p>
            <EuiLink onClick={() => redirectToDashboards('/view/' + props.dashboardId)}>
              {props.dashboardTitle}
            </EuiLink>
          </p>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiSuperDatePicker
              start={props.startDate}
              end={props.endDate}
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
                onClick={props.showFlyout}
                display="base"
                size="s"
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
