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
}

export const ServicesList = ({
  serviceMap,
  addFilter,
  filteredService,
  setFilteredService,
}: ServicesListProps) => {
  const [options, setOptions] = useState<Array<{ label: string }>>([]);

  const nameColumnAction = (serviceName: string) => {
    if (!addFilter) return;
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
    setOptions(
      Object.keys(serviceMap).map((key) => {
        return filteredService === key
          ? { label: key, checked: 'on', bordered: false }
          : { label: key, bordered: false };
      })
    );
  }, [serviceMap]);

  return (
    <EuiPanel>
      {titleBar}
      <EuiSpacer size="m" />
      <EuiHorizontalRule margin="none" />
      <div style={{ height: '90%' }}>
        <EuiSelectable
          aria-label="Basic example"
          height="full"
          searchable
          options={options}
          listProps={{ bordered: true }}
          onChange={(newOptions) => {
            setOptions(newOptions);
            nameColumnAction(newOptions.filter((option) => option.checked === 'on')[0].label);
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
