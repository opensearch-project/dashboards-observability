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
      <EuiTitle>
        <h2>Details</h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiText>
            <h4>Version</h4>
          </EuiText>
          {/*
          For the link, we have the slightly odd constraint to have it go to the end of the version
          space while being horizontally next to the version (i.e. no direct EuiText). It should be
          smaller, while aligning to the bottom of the line, but not the bottom of the entire flex
          area, for a nice subscript effect.

          The end result is a bit of flex magic: make two vertical boxes with the second one empty
          and growing, then in the top one put two horizontal boxes with space-between, aligning to
          the bottom.
          */}
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiFlexGroup justifyContent="spaceBetween" alignItems="flexEnd" responsive={false}>
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
            <EuiFlexItem />
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText>
            <h4>Category</h4>
          </EuiText>
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
          <EuiText size="s">
            <EuiLink href={config.sourceUrl} external={true} target="blank">
              {config.author}
            </EuiLink>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText>
            <h4>License</h4>
          </EuiText>
          <EuiText size="s">{config.license}</EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiFlexItem>
        <EuiText>
          <h4>Description</h4>
        </EuiText>
        <EuiText size="s">{config.description}</EuiText>
      </EuiFlexItem>
    </EuiPanel>
  );
}
