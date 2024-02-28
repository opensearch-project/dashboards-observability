/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiIcon,
  EuiTabbedContent,
  EuiText,
} from '@elastic/eui';
import React from 'react';
import { AccelerationDetailsTab } from './flyout_modules/acceleration_details_tab';
import { AccelerationSchemaTab } from './flyout_modules/accelerations_schema_tab';
import { AccelerationSqlTab } from './flyout_modules/acceleration_sql_tab';
import {
  getRefreshButtonIcon,
  onRefreshButtonClick,
  onDiscoverButtonClick,
  onDeleteButtonClick,
} from '../accelerations/helpers/utils';

interface AccelerationDetailsFlyoutProps {
  acceleration: any;
  setIsFlyoutVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export const AccelerationDetailsFlyout = (props: AccelerationDetailsFlyoutProps) => {
  const { acceleration, setIsFlyoutVisible } = props;

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

  const tabs = [
    {
      id: 'details',
      name: 'Details',
      disabled: false,
      content: <AccelerationDetailsTab acceleration={acceleration} />,
    },
    {
      id: 'schema',
      name: 'Schema',
      disabled: false,
      content: <AccelerationSchemaTab acceleration={acceleration} />,
    },
    {
      id: 'sql_definition',
      name: 'SQL Definition',
      disabled: false,
      content: <AccelerationSqlTab acceleration={acceleration} />,
    },
  ];

  return (
    <EuiFlyout ownFocus onClose={() => setIsFlyoutVisible(false)} paddingSize="l">
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
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiTabbedContent tabs={tabs} />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
