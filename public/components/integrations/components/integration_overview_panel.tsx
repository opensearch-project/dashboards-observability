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
  const { data } = props;
  return (
    <EuiPageHeader style={{ justifyContent: 'center' }}>
      <img
        src={`${INTEGRATIONS_BASE}/repository/nginx/static/logo`}
        alt="React Logo"
        style={{ height: 53, width: 53 }}
      />
      <EuiSpacer size="m" />
      <EuiPageHeaderSection style={pageStyles}>
        <EuiPageContentHeaderSection>
          <EuiFlexGroup gutterSize="xs">
            <EuiFlexItem>
              <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                <EuiLink href={data.data.link} external={true} target="blank">
                  {data.data.name}
                </EuiLink>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiButton
                size="s"
                onClick={() => {
                  props.getModal(data.data.name);
                }}
              >
                Add
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
            <EuiText size="m">{data.data.status}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Version</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{data.data.version}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Category</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{data.data.components?.map((x: any) => x.name).join(', ')}</EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>Contributer</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiLink href={data.data.sourceUrl} external={true} target="blank">
              {data.data.author}
            </EuiLink>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText>
              <h4>License</h4>
            </EuiText>
            <EuiSpacer size="m" />
            <EuiText size="m">{data.data.license}</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageHeaderSection>
    </EuiPageHeader>
  );
}
