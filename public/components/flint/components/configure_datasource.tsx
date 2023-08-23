/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './accelerate.scss';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiGlobalToastList,
  EuiLoadingSpinner,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiCheckableCard,
  htmlIdGenerator,
  EuiTitle,
  EuiText,
  EuiLink,
  EuiButton,
  EuiInMemoryTable,
  EuiTableFieldDataColumnType,
  EuiPageContent,
  EuiSteps,
  EuiPageSideBar,
  EuiPanel,
  EuiFormRow,
  EuiFieldText,
  EuiBottomBar,
  EuiButtonEmpty,
} from '@elastic/eui';
import React, { ReactChild, useEffect, useState } from 'react';
import httpClientMock from 'test/__mocks__/httpClientMock';
import { AccelerateHeader } from './accelerate_header';
import { AccelerateCallout } from './accelerate_callout';
import {
  ASSET_FILTER_OPTIONS,
  OPENSEARCH_DOCUMENTATION_URL,
} from '../../../../common/constants/integrations';
import { AccelerateFlyout } from './accelerate_flyout';

export function Configure(props: any) {
  const firstSetOfSteps = [
    {
      title: 'Step 1',
      children: (
        <EuiText>
          <p>Configure Connection</p>
        </EuiText>
      ),
    },
    {
      title: 'Step 2',
      children: (
        <EuiText>
          <p>Review Configuration</p>
        </EuiText>
      ),
    },
  ];

  const body = (connectionType: string) => {
    return (
      <div>
        <EuiPanel>
          <EuiTitle>
            <h1>{`Configure ${connectionType} Connection`}</h1>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            {`Connect to ${connectionType} with OpenSearch and OpenSearch Dashboards `}
            <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
              Learn more
            </EuiLink>
          </EuiText>
          <EuiSpacer />
          <EuiText>
            <h3>Connection Details</h3>
          </EuiText>
          <EuiSpacer />
          <EuiFormRow label="Title">
            <EuiFieldText data-test-subj="data-source-name" name="first" />
          </EuiFormRow>
          <EuiFormRow label="Description - Optional">
            <EuiFieldText data-test-subj="data-source-name" name="first" />
          </EuiFormRow>

          <EuiFormRow label="Endpoint URL">
            <EuiFieldText data-test-subj="data-source-name" name="first" />
          </EuiFormRow>
        </EuiPanel>
      </div>
    );
  };

  return (
    <EuiPage>
      <EuiPageSideBar>
        <EuiSteps steps={firstSetOfSteps} />
      </EuiPageSideBar>
      <EuiPageBody>{body('Amazon S3')}</EuiPageBody>

      <EuiBottomBar>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={() => {}} color="ghost" size="s" iconType="cross">
              Cancel
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton onClick={() => {}} color="ghost" size="s" iconType="arrowLeft">
              Previous
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton onClick={() => {}} size="s" iconType="arrowRight" fill>
              Review Configuration
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiBottomBar>
    </EuiPage>
  );
}
