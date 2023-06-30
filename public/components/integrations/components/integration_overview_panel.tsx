/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiFlexGroup,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiTitle,
  EuiFlexItem,
  EuiText,
  EuiPageContentHeaderSection,
} from '@elastic/eui';
import React from 'react';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';

const pageStyles: CSS.Properties = {
  width: '80%',
};

export function IntegrationOverview(props: any) {
  const config = props.integration;
  return (
    <EuiPageHeader style={{ justifyContent: 'center' }} data-test-subj={`${config.name}-overview`}>
      <EuiSpacer size="m" />
      <EuiPageHeaderSection style={pageStyles}>
        <EuiPageContentHeaderSection>
          <EuiFlexGroup gutterSize="xs">
            <EuiFlexItem>
              <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                <EuiLink href={config.link} external={true} target="blank">
                  {config.displayName || config.name}
                </EuiLink>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="m"
                onClick={() => {
                  props.showFlyout(config.name);
                }}
                fill
                data-test-subj="add-integration-button"
              >
                Set Up
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="m"
                onClick={() => {
                  props.setUpSample();
                }}
                fill
                data-test-subj="add-integration-button"
              >
                Try It
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageContentHeaderSection>
        <EuiSpacer />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiText>
              <h4>Status</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{config.status}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Version</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{config.version}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Category</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{config.components?.map((x: any) => x.name).join(', ')}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Contributer</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiLink href={config.sourceUrl} external={true} target="blank">
              {config.author}
            </EuiLink>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>License</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{config.license}</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageHeaderSection>
    </EuiPageHeader>
  );
}
