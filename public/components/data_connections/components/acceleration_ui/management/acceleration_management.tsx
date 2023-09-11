/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { ManagementTable } from './management_table';
import { AccelerationDataSourceSelector } from './source_selector';

export const AccelerationManagement = () => {
  return (
    <>
      <AccelerationDataSourceSelector />
      <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
        <EuiFlexItem>
          <EuiText data-test-subj="acceleration-management-header">
            <h3>Manage existing acceleration indices</h3>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            View and Edit acceleration indices{' '}
          </EuiText>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s" justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <EuiButton>Delete</EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton fill href="#/create" data-test-subj="create-acceleration-indexBtn">
                Accelerate Table
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiHorizontalRule size="full" />
      <ManagementTable />
    </>
  );
};
