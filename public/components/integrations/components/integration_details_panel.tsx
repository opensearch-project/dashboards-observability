/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBadge,
  EuiBadgeGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React from 'react';

export function IntegrationDetails(props: any) {
  const config = props.integration;
  let screenshots;
  if (config.statics.gallery) {
    screenshots = config.statics.gallery;
  }

  return (
    <EuiPanel data-test-subj={`${config.name}-details`}>
      <EuiTitle>
        <h2>Details</h2>
      </EuiTitle>
      <EuiSpacer />
      <EuiFlexGroup>
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
          <EuiBadgeGroup>
            {config.labels?.map((label: string) => {
              return <EuiBadge>{label}</EuiBadge>;
            })}
          </EuiBadgeGroup>
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
      <EuiFlexItem>
        <EuiText>
          <h4>Description</h4>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiText size="m">{config.description}</EuiText>
      </EuiFlexItem>
    </EuiPanel>
  );
}
