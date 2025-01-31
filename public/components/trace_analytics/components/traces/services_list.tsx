/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSelectable,
  EuiSpacer,
} from '@elastic/eui';
import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { FilterType } from '../common/filters/filters';
import { PanelTitle } from '../common/helper_functions';
import { ServiceObject } from '../common/plots/service_map';

interface ServicesListProps {
  serviceMap: ServiceObject;
  addFilter?: (filter: FilterType) => void;
  filteredService: string;
  setFilteredService: React.Dispatch<React.SetStateAction<string>>;
  filters: FilterType[];
  setFilters: (filters: FilterType[]) => void;
  isServicesDataLoading: boolean;
}

export const ServicesList = ({
  serviceMap,
  addFilter,
  filteredService,
  setFilteredService,
  filters = [],
  setFilters,
  isServicesDataLoading,
}: ServicesListProps) => {
  const [options, setOptions] = useState<Array<{ label: string; checked?: 'on' | undefined }>>([]);

  const removeFilter = (field: string, value: string) => {
    if (!setFilters) return;
    const updatedFilters = filters.filter(
      (filter) => !(filter.field === field && filter.value === value)
    );
    setFilters(updatedFilters);
  };

  const nameColumnAction = (serviceName: string) => {
    if (!addFilter) return;

    // Check if the service is already selected
    if (filteredService === serviceName) {
      // Remove the filter if the service is deselected
      removeFilter('serviceName', filteredService);
      setFilteredService(''); // Reset the selected service
      return;
    }

    // Add the filter if a new service is selected
    addFilter({
      field: 'serviceName',
      operator: 'is',
      value: serviceName,
      inverted: false,
      disabled: false,
    });
    setFilteredService(serviceName);
    setTimeout(function () {
      window.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }, 500);
  };

  const titleBar = useMemo(
    () => (
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem grow={10}>
          <PanelTitle title="Services" totalItems={Object.keys(serviceMap).length} />
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    [serviceMap]
  );

  useEffect(() => {
    // Update selectable options based on the current filtered service
    setOptions(
      Object.keys(serviceMap).map((key) => ({
        label: key,
        checked: filteredService === key ? 'on' : undefined,
      }))
    );
  }, [serviceMap, filteredService]);

  return (
    <EuiPanel>
      {titleBar}
      <EuiSpacer size="m" />
      <EuiHorizontalRule margin="none" />
      <div style={{ height: '90%' }}>
        <EuiSelectable
          aria-label="Services List"
          height="full"
          searchable
          options={options}
          listProps={{ bordered: true }}
          isLoading={isServicesDataLoading}
          onChange={(newOptions) => {
            const selectedOption = newOptions.find((option) => option.checked === 'on');

            // Handle deselection
            if (!selectedOption) {
              nameColumnAction(filteredService);
              setOptions(newOptions);
              return;
            }

            // Handle selection
            if (selectedOption) {
              nameColumnAction(selectedOption.label);
              setOptions(newOptions);
            }
          }}
          singleSelection={true}
        >
          {(list, search) => (
            <Fragment>
              {search}
              {list}
            </Fragment>
          )}
        </EuiSelectable>
      </div>
    </EuiPanel>
  );
};
