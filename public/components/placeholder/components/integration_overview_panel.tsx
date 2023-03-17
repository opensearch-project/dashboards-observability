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
  EuiPageContentHeaderSection,
} from '@elastic/eui';
import React from 'react';
import logo from '../assets/nginx-svgrepo-com.svg';

const pageStyles: CSS.Properties = {
  width: '80%',
};

export function IntegrationOverview(props: {
  appId;
  link;
  status;
  version;
  category;
  contributer;
  license;
}) {
  return (
    <EuiPageHeader style={{ justifyContent: 'center' }}>
      <img src={logo} alt="React Logo" style={{ height: 53, width: 36 }} />
      <EuiPageHeaderSection style={pageStyles}>
        <EuiPageContentHeaderSection>
          <EuiFlexGroup gutterSize="xs">
            <EuiFlexItem>
              <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                <EuiLink href={props.link} external={true} target="blank">
                  {props.appId}
                </EuiLink>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiButton size="s">Add</EuiButton>
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
            <EuiText size="m">{props.status}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Version</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{props.version}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Category</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{props.category}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Contributer</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiLink href={props.contributer.link} external={true} target="blank">
              {props.contributer.name}
            </EuiLink>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>License</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{props.license}</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageHeaderSection>
    </EuiPageHeader>
  );
}
