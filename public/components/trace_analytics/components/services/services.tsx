/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb, EuiTitle } from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import { TraceAnalyticsComponentDeps } from '../../home';
import { DataSourcePicker } from '../dashboard/mode_picker';
import { ServicesContent } from './services_content';

export interface ServicesProps extends TraceAnalyticsComponentDeps {
  childBreadcrumbs: EuiBreadcrumb[];
  nameColumnAction: any;
  traceColumnAction: any;
  page: 'services' | 'app';
}

export function Services(props: ServicesProps) {
  return (
    <>
      <EuiTitle size="l">
        <h2 style={{ fontWeight: 430 }}>Services</h2>
      </EuiTitle>
      <DataSourcePicker
        modes={props.modes}
        selectedMode={props.mode}
        setMode={props.setMode!}
        customIndexPattern={props.customIndexPattern}
        setCustomIndexPattern={props.setCustomIndexPattern}
      />
      <ServicesContent {...props} />
    </>
  );
}
