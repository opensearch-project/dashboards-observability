import {
  EuiButton,
  EuiFlexGroup,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiFlexItem,
  EuiText,
} from '@elastic/eui';
import React from 'react';

export function IntegrationOverview(props: { appId; link }) {
  return (
    <EuiPageHeader>
      <EuiPageHeaderSection>
        <EuiFlexGroup>
          <EuiTitle data-test-subj="eventHomePageTitle" size="l">
            <EuiLink href={props.link} external={true} target="blank">
              {props.appId}
            </EuiLink>
          </EuiTitle>
          <EuiButton>Add</EuiButton>
        </EuiFlexGroup>
        <EuiSpacer />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiText>
              <h4>Status</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">hello</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Version</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">hello</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Category</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">hello</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Contributer</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">hello</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>License</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">hello</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageHeaderSection>
    </EuiPageHeader>
  );
}
