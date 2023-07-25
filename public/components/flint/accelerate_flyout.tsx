/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash';
import {
  EuiButton,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiText,
  EuiLink,
  EuiFormRow,
  EuiTitle,
} from '@elastic/eui';
import React, { useState } from 'react';
import { IfVoid } from '@reduxjs/toolkit/dist/tsHelpers';
import { HttpStart } from '../../../../../../src/core/public';
import { useToast } from '../../../../public/components/common/toast';
import { AcceleratePage } from './accelerate_page';

interface AccelerateFlyoutProps {
  onClose: () => void;
}

export function AccelerateFlyout(props: AccelerateFlyoutProps) {
  return (
    <EuiFlyout data-test-subj="accelerateFlyout" onClose={props.onClose} size="m">
      <EuiFlyoutBody>
        <AcceleratePage />
      </EuiFlyoutBody>
      {/* <EuiFlyoutBody>{renderContent()}</EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiButton onClick={() => onClose()} color="danger">
              Cancel
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiButton
              onClick={() => {
                onCreate(name, dataSource);
                onClose();
              }}
              fill
              disabled={
                dataSource.length < 1 ||
                dataSource.length > 50 ||
                name.length < 1 ||
                name.length > 50 ||
                isDataSourceValid !== true
              }
              data-test-subj="createInstanceButton"
              data-click-metric-element="integrations.create_from_setup"
            >
              Add Integration
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter> */}
    </EuiFlyout>
  );
}
