/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import React from 'react';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { TraceAnalyticsComponentDeps } from '../../home';
import { ServicesContent } from './services_content';

export interface ServicesProps extends TraceAnalyticsComponentDeps {
  childBreadcrumbs: EuiBreadcrumb[];
  traceColumnAction: any;
  setCurrentSelectedService: (value: React.SetStateAction<string>) => void;
  page: 'services' | 'app';
  toasts: Toast[];
  dataSourceMDSId: DataSourceOption[];
}

export function Services(props: ServicesProps) {
  return (
    <>
      <ServicesContent {...props} />
    </>
  );
}
