/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb, EuiTitle } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import React from 'react';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { TraceAnalyticsComponentDeps } from '../../home';
import { DashboardContent } from './dashboard_content';
import { DataSourcePicker } from './mode_picker';

export interface DashboardProps extends TraceAnalyticsComponentDeps {
  childBreadcrumbs: EuiBreadcrumb[];
  page: 'dashboard' | 'app';
  toasts: Toast[];
  setToast?: (
    title: string,
    color?: string,
    text?: React.ReactChild | undefined,
    side?: string | undefined
  ) => void;
  dataSourceMDSId: DataSourceOption[];
}

export function Dashboard(props: DashboardProps) {
  return (
    <>
      <EuiTitle size="l">
        <h2 style={{ fontWeight: 430 }}>Dashboard</h2>
      </EuiTitle>
      <DataSourcePicker modes={props.modes} selectedMode={props.mode} setMode={props.setMode!} />
      <DashboardContent {...props} />
    </>
  );
}
