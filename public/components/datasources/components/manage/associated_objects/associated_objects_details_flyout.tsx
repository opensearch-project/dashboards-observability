/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiText,
  EuiIcon,
  EuiButtonEmpty,
  EuiFlexItem,
  EuiFlexGroup,
} from '@elastic/eui';
import { AssociatedObject } from 'common/types/data_connections';
import {
  onAccelerateButtonClick,
  onDeleteButtonClick,
  onDiscoverButtonClick,
} from './utils/associated_objects_tab_utils';

export interface AssociatedObjectsFlyoutProps {
  tableDetail: AssociatedObject;
}

export const AssociatedObjectsDetailsFlyout = ({ tableDetail }: AssociatedObjectsFlyoutProps) => {
  const DiscoverButton = () => {
    // TODO: display button if can be sent to discover
    return (
      <EuiButtonEmpty onClick={onDiscoverButtonClick}>
        <EuiIcon type={'discoverApp'} size="m" />
      </EuiButtonEmpty>
    );
  };

  const AccelerateButton = () => {
    return (
      <EuiButtonEmpty onClick={onAccelerateButtonClick}>
        <EuiIcon type={'bolt'} size="m" />
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

  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup direction="row" alignItems="center" gutterSize="m">
          <EuiFlexItem>
            <EuiText size="m">
              <h2 className="accsDetailFlyoutTitle">{tableDetail.name}</h2>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <DiscoverButton />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <AccelerateButton />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <DeleteButton />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiText>
          <p>
            <strong>Database:</strong> {tableDetail.database}
          </p>
          <p>
            <strong>Type:</strong> {tableDetail.type}
          </p>
          <p>
            <strong>ID:</strong> {tableDetail.id}
          </p>
          <p>
            <strong>Created By Integration:</strong> {tableDetail.createdByIntegration || 'N/A'}
          </p>
          {tableDetail.accelerations && tableDetail.accelerations.length > 0 && (
            <>
              <EuiSpacer />
              <p>
                <strong>Accelerations:</strong>
              </p>
              {tableDetail.accelerations.map((acceleration, index) => (
                <p key={index}>{acceleration.name}</p>
              ))}
            </>
          )}
        </EuiText>
      </EuiFlyoutBody>
    </>
  );
};
