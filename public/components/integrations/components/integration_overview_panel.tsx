/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPageContentHeaderSection,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiTitle,
  EuiSmallButton,
} from '@elastic/eui';
import React from 'react';
import { HeaderControlledComponentsWrapper } from '../../../../public/plugin_helpers/plugin_headerControl';
import { coreRefs } from '../../../framework/core_refs';

const newNavigation = coreRefs.chrome?.navGroup.getNavGroupEnabled();

const pageStyles = {
  width: '100%',
};

export function IntegrationOverview(props: any) {
  const config = props.integration;

  const buttons = (
    <>
      <EuiFlexItem grow={false}>
        <EuiSmallButton
          onClick={() => {
            props.setUpSample();
          }}
          disabled={props.loading}
          data-test-subj="try-it-button"
          data-click-metric-element="integrations.create_from_try_it"
        >
          Try with sample data
        </EuiSmallButton>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiSmallButton
          onClick={() => {
            props.showFlyout(config.name);
          }}
          fill
          disabled={props.loading}
          data-test-subj="add-integration-button"
          data-click-metric-element="integrations.set_up"
        >
          Set up integration
        </EuiSmallButton>
      </EuiFlexItem>
    </>
  );

  return newNavigation ? (
    <HeaderControlledComponentsWrapper
      components={[
        <EuiFlexGroup gutterSize="s" alignItems="flexEnd" responsive={false}>
          {buttons}
        </EuiFlexGroup>,
      ]}
    />
  ) : (
    <EuiPageHeader data-test-subj={`${config.name}-overview`}>
      <EuiPageHeaderSection style={pageStyles}>
        <EuiPageContentHeaderSection>
          <EuiFlexGroup gutterSize="xs" justifyContent="spaceBetween">
            <EuiFlexItem>
              <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                <h3>{config.displayName || config.name}</h3>
              </EuiTitle>
            </EuiFlexItem>
            {buttons}
          </EuiFlexGroup>
        </EuiPageContentHeaderSection>
      </EuiPageHeaderSection>
    </EuiPageHeader>
  );
}
