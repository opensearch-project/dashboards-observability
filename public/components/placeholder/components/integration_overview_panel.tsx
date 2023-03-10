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

const pageStyles: CSS.Properties = {
  width: '80%',
};

export function IntegrationOverview(props: { appId; link }) {
  return (
    <EuiPageHeader style={{ justifyContent: 'center' }}>
      <EuiPageHeaderSection style={pageStyles}>
        {/* <EuiPageContentHeader>
              <EuiPageContentHeaderSection>
                <EuiTitle data-test-subj="applicationHomePageTitle" size="s">
                  <h3>
                    Applications<span className="panel-header-count"> ({applications.length})</span>
                  </h3>
                </EuiTitle>
              </EuiPageContentHeaderSection>
              <EuiPageContentHeaderSection>
                <EuiFlexGroup gutterSize="s">
                  <EuiFlexItem>
                    <EuiPopover
                      panelPaddingSize="none"
                      button={popoverButton}
                      isOpen={isActionsPopoverOpen}
                      closePopover={() => setIsActionsPopoverOpen(false)}
                    >
                      <EuiContextMenuPanel items={popoverItems} />
                    </EuiPopover>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiButton fill href="#/application_analytics/create">
                      {createButtonText}
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPageContentHeaderSection>
            </EuiPageContentHeader> */}
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
