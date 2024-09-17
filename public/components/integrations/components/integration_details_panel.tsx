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
import { OPENSEARCH_CATALOG_URL } from '../../../../common/constants/integrations';

export function IntegrationDetails(props: { integration: IntegrationConfig }) {
  const config = props.integration;

  return (
    <EuiPanel data-test-subj={`${config.name}-details`}>
      <EuiSpacer size="s" />
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>Version</h3>
          </EuiTitle>
          <EuiFlexGroup direction="row" alignItems="center" responsive={false} gutterSize="xs">
            <EuiFlexItem grow={false}>
              <EuiText size="m">{config.version}</EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs">
                <EuiLink href={OPENSEARCH_CATALOG_URL}>Check for new versions</EuiLink>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>Category</h3>
          </EuiTitle>
          <EuiBadgeGroup>
            {config.labels?.map((label: string) => {
              return <EuiBadge>{label}</EuiBadge>;
            })}
          </EuiBadgeGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>Contributor</h3>
          </EuiTitle>
          <EuiText size="s">
            <EuiLink href={config.sourceUrl} external={true} target="blank">
              {config.author}
            </EuiLink>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>License</h3>
          </EuiTitle>
          <EuiText size="s">{config.license}</EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiFlexItem>
        <EuiTitle size="s">
          <h3>Description</h3>
        </EuiTitle>
        <EuiText size="s">{config.description}</EuiText>
      </EuiFlexItem>
    </EuiPanel>
  );
}
