/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { TraceAnalyticsComponentDeps } from '../../home';
import { FilterType } from '../common/filters/filters';
import { ServiceView } from './service_view';

interface ServiceFlyoutProps {
  serviceName: string;
  setCurrentSelectedService: React.Dispatch<React.SetStateAction<string>>;
  dataSourceMDSId: DataSourceOption[];
  commonProps: TraceAnalyticsComponentDeps;
}

export const ServiceFlyout = ({
  serviceName,
  setCurrentSelectedService,
  dataSourceMDSId,
  commonProps,
}: ServiceFlyoutProps) => {
  return (
    <>
      <ServiceView
        serviceName={serviceName}
        {...commonProps}
        addFilter={(filter: FilterType) => {
          for (const addedFilter of commonProps.filters) {
            if (
              addedFilter.field === filter.field &&
              addedFilter.operator === filter.operator &&
              addedFilter.value === filter.value
            ) {
              return;
            }
          }
          const newFilters = [...commonProps.filters, filter];
          commonProps.setFilters(newFilters);
        }}
        dataSourceMDSId={dataSourceMDSId}
        page="serviceFlyout"
        setCurrentSelectedService={setCurrentSelectedService}
      />
    </>
  );
};
