/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb, EuiTitle } from '@elastic/eui';
import React from 'react';
import { TraceAnalyticsComponentDeps } from '../../home';
import { DataSourcePicker } from '../dashboard/mode_picker';
import { TracesContent } from './traces_content';

export interface TracesProps extends TraceAnalyticsComponentDeps {
  page: 'traces' | 'app';
  childBreadcrumbs: EuiBreadcrumb[];
  traceIdColumnAction: any;
}

export function Traces(props: TracesProps) {
  return (
    <>
      <EuiTitle size="l">
        <h2 style={{ fontWeight: 430 }}>Traces</h2>
      </EuiTitle>
      <DataSourcePicker
        modes={props.modes}
        selectedMode={props.mode}
        setMode={props.setMode!}
        customIndexPattern={props.customIndexPattern}
        setCustomIndexPattern={props.setCustomIndexPattern}
      />
      <TracesContent {...props} />
    </>
  );
}
