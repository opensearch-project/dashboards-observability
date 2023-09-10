/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb } from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import { TraceAnalyticsComponentDeps } from '../../home';
import { DataSourcePicker } from '../dashboard/mode_picker';
import { ServicesContent } from './services_content';

export interface ServicesProps extends TraceAnalyticsComponentDeps {
  childBreadcrumbs: EuiBreadcrumb[];
  nameColumnAction: any;
  traceColumnAction: any;
  page: 'services' | 'app';
  toasts: Toast[];
}

export function Services(props: ServicesProps) {
  return (
    <>
      <DataSourcePicker modes={props.modes} selectedMode={props.mode} setMode={props.setMode!} />
      <ServicesContent {...props} />
    </>
  );
}
