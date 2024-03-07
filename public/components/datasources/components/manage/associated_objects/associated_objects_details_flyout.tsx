/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFlyoutBody, EuiFlyoutHeader, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import { AssociatedObject } from 'common/types/data_connections';

// Assuming the AssociatedObject interface is correctly defined elsewhere
export interface AssociatedObjectsFlyoutProps {
  tableDetail: AssociatedObject;
}

export const AssociatedObjectsDetailsFlyout = ({ tableDetail }: AssociatedObjectsFlyoutProps) => {
  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="flyoutTitle">{tableDetail.name}</h2>
        </EuiTitle>
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
