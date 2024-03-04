/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiIcon,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
} from '@elastic/eui';
import React, { useState } from 'react';
import { AccelerationDetailsTab } from './flyout_modules/acceleration_details_tab';
import { AccelerationSchemaTab } from './flyout_modules/accelerations_schema_tab';
import { AccelerationSqlTab } from './flyout_modules/acceleration_sql_tab';
import {
  getRefreshButtonIcon,
  onRefreshButtonClick,
  onDiscoverButtonClick,
  onDeleteButtonClick,
} from '../accelerations/helpers/utils';

export interface AccelerationDetailsFlyoutProps {
  acceleration: any;
}

export const AccelerationDetailsFlyout = (props: AccelerationDetailsFlyoutProps) => {
  const { acceleration } = props;
  const [selectedTab, setSelectedTab] = useState('details');
  const tabsMap: { [key: string]: any } = {
    details: AccelerationDetailsTab,
    schema: AccelerationSchemaTab,
    sql_definition: AccelerationSqlTab,
  };

  const DiscoverButton = () => {
    // TODO: display button if can be sent to discover
    return (
      <EuiButtonEmpty onClick={onDiscoverButtonClick}>
        <EuiIcon type={'discoverApp'} size="m" />
      </EuiButtonEmpty>
    );
  };

  const RefreshButton = () => {
    return (
      <EuiButtonEmpty onClick={onRefreshButtonClick}>
        <EuiIcon type={getRefreshButtonIcon()} size="m" />
      </EuiButtonEmpty>
    );
  };

  const DeleteButton = () => {
    return (
      <EuiButtonEmpty onClick={onDeleteButtonClick}>
        <EuiIcon type="trash" size="m" />
      </EuiButtonEmpty>
    );
  };

  const accelerationDetailsTabs = [
    {
      id: 'details',
      name: 'Details',
      disabled: false,
    },
    {
      id: 'schema',
      name: 'Schema',
      disabled: false,
    },
    {
      id: 'sql_definition',
      name: 'SQL Definition',
      disabled: false,
    },
  ];

  const renderTabs = () => {
    return accelerationDetailsTabs.map((tab, index) => {
      return (
        <EuiTab
          onClick={() => setSelectedTab(tab.id)}
          isSelected={tab.id === selectedTab}
          disabled={tab.disabled}
          key={index}
        >
          {tab.name}
        </EuiTab>
      );
    });
  };

  const renderTabContent = (tab: string, tabAcceleration: any) => {
    const TabToDisplay = tabsMap[tab];
    return <TabToDisplay acceleration={tabAcceleration} />;
  };

  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup direction="row" alignItems="center" gutterSize="m">
          <EuiFlexItem>
            <EuiText>
              <h2 className="panel-title">{acceleration.name}</h2>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <DiscoverButton />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <RefreshButton />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <DeleteButton />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <EuiTabs style={{ marginBottom: '-25px' }}>{renderTabs()}</EuiTabs>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>{renderTabContent(selectedTab, acceleration)}</EuiFlyoutBody>
    </>
  );
};
