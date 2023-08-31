/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiFlexGroup,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiTitle,
  EuiFlexItem,
  EuiPageContentHeaderSection,
} from '@elastic/eui';
import React from 'react';

const pageStyles: CSS.Properties = {
  width: '100%',
  justifyContent: 'spaceBetween',
};

export function IntegrationOverview(props: any) {
  const config = props.integration;
  return (
    <EuiPageHeader
      style={{ justifyContent: 'spaceBetween' }}
      data-test-subj={`${config.name}-overview`}
    >
      <EuiSpacer size="m" />
      <EuiPageHeaderSection style={pageStyles}>
        <EuiPageContentHeaderSection>
          <EuiFlexGroup gutterSize="xs" justifyContent="spaceBetween">
            <EuiFlexItem>
              <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                <h1>{config.displayName || config.name}</h1>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="m"
                onClick={() => {
                  props.setUpSample();
                }}
                disabled={props.loading}
                data-test-subj="try-it-button"
                data-click-metric-element="integrations.create_from_try_it"
              >
                Try It
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="m"
                onClick={() => {
                  props.showFlyout(config.name);
                }}
                fill
                disabled={props.loading}
                data-test-subj="add-integration-button"
                data-click-metric-element="integrations.set_up"
              >
                Set Up
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageContentHeaderSection>
      </EuiPageHeaderSection>
    </EuiPageHeader>
  );
}
