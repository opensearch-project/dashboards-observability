/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlyoutHeader,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/integrations';
import { AccelerateHeaderProps } from './accelerate_types';

export function AccelerateHeader(props: AccelerateHeaderProps) {
  if (props.isFlyout) {
    return (
      <div>
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="l" data-test-subj="accelerate-header">
            <h1>Accelerate Data</h1>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            Index your data in OpenSearch for faster query performance.{' '}
            <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
              Learn more
            </EuiLink>
          </EuiText>
        </EuiFlyoutHeader>
      </div>
    );
  }
  return (
    <div>
      <EuiPageHeader>
        <EuiPageHeaderSection>
          <EuiTitle size="l" data-test-subj="accelerate-header">
            <h1>Accelerate Data</h1>
          </EuiTitle>
        </EuiPageHeaderSection>
      </EuiPageHeader>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Index your data in OpenSearch for faster query performance.{' '}
        <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
          Learn more
        </EuiLink>
      </EuiText>
    </div>
  );
}
