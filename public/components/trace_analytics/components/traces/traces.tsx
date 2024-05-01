/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb } from '@elastic/eui';
import React from 'react';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { TraceAnalyticsComponentDeps } from '../../home';
import { DataSourcePicker } from '../dashboard/mode_picker';
import { TracesContent } from './traces_content';

export interface TracesProps extends TraceAnalyticsComponentDeps {
  page: 'traces' | 'app';
  childBreadcrumbs: EuiBreadcrumb[];
  traceIdColumnAction: any;
  dataSourceMDSId: DataSourceOption[];
}

export function Traces(props: TracesProps) {
  return (
    <>
      <DataSourcePicker modes={props.modes} selectedMode={props.mode} setMode={props.setMode!} />
      <TracesContent {...props} />
    </>
  );
}
