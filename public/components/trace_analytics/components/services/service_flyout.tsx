/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlyout, EuiFlyoutBody } from '@elastic/eui';
import React from 'react';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import { TraceAnalyticsComponentDeps } from '../../home';
import { FilterType } from '../common/filters/filters';
import { ServiceView } from './service_view';

interface ServiceFlyoutProps {
  serviceName: string;
  dataSourceMDSId: DataSourceOption[];
  onClose: () => {};
  commonProps: TraceAnalyticsComponentDeps;
}

export const ServiceFlyout = ({
  serviceName,
  dataSourceMDSId,
  onClose,
  commonProps,
}: ServiceFlyoutProps) => {
  return (
    <>
      <EuiFlyout
        ownFocus
        onClose={onClose}
        hideCloseButton
        aria-labelledby="flyoutComplicatedTitle"
      >
        {/* <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2 id="flyoutComplicatedTitle">Flyout header</h2>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText color="subdued">
            <p>Put navigation items in the header, and cross tab actions in a footer.</p>
          </EuiText>
        </EuiFlyoutHeader> */}
        <EuiFlyoutBody>
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
          />
        </EuiFlyoutBody>
        {/* <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty iconType="cross" onClick={onClose} flush="left">
                Close
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton onClick={onClose} fill>
                Save
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter> */}
      </EuiFlyout>
    </>
  );
};
