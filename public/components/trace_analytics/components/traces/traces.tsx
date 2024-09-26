/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import React from 'react';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { TraceQueryMode } from '../../../../../common/types/trace_analytics';
import { TraceAnalyticsComponentDeps } from '../../home';
import { TracesContent } from './traces_content';

export interface TracesProps extends TraceAnalyticsComponentDeps {
  page: 'traces' | 'app';
  childBreadcrumbs: EuiBreadcrumb[];
  setCurrentSelectedService: React.Dispatch<React.SetStateAction<string>>;
  getTraceViewUri?: (traceId: string) => string;
  openTraceFlyout?: (traceId: string) => void;
  toasts: Toast[];
  dataSourceMDSId: DataSourceOption[];
  tracesTableMode: TraceQueryMode;
  setTracesTableMode: React.Dispatch<React.SetStateAction<TraceQueryMode>>;
}

export function Traces(props: TracesProps) {
  return (
    <>
      <TracesContent {...props} />
    </>
  );
}
