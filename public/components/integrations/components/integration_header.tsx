/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
  EuiSmallButton,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import React, { useState } from 'react';
import {
  OPENSEARCH_CATALOG_URL,
  OPENSEARCH_DOCUMENTATION_URL,
} from '../../../../common/constants/integrations';
import { IntegrationUploadFlyout } from './upload_flyout';
import { HeaderControlledComponentsWrapper } from '../../../../public/plugin_helpers/plugin_headerControl';
import { coreRefs } from '../../../framework/core_refs';
import {
  TopNavControlButtonData,
  TopNavControlLinkData,
} from '../../../../../../src/plugins/navigation/public';

const newNavigation = coreRefs.chrome?.navGroup.getNavGroupEnabled();

export const IntegrationHeaderActions = ({
  onShowUpload,
}: {
  onShowUpload: () => void;
}): Array<TopNavControlButtonData | TopNavControlLinkData> => {
  return [
    {
      label: 'View Catalog',
      href: OPENSEARCH_CATALOG_URL,
      target: '_blank',
      controlType: 'link',
    } as TopNavControlLinkData,
    {
      label: 'Upload Integration',
      run: onShowUpload,
      fill: true,
      controlType: 'button',
    } as TopNavControlButtonData,
  ];
};

export const IntegrationHeaderActionsOldNav = ({ onShowUpload }: { onShowUpload: () => void }) => {
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiLink href={OPENSEARCH_CATALOG_URL} external={true}>
          View Catalog
        </EuiLink>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiSmallButton onClick={onShowUpload} fill>
          Upload Integration
        </EuiSmallButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const IntegrationHeader = () => {
  const tabs = [
    {
      id: 'installed',
      name: 'Installed',
      disabled: false,
    },
    {
      id: 'available',
      name: 'Available',
      disabled: false,
    },
  ];

  const [selectedTabId, setSelectedTabId] = useState(
    window.location.hash.substring(2) ? window.location.hash.substring(2) : 'installed'
  );
  const [showUploadFlyout, setShowUploadFlyout] = useState(false);

  const onSelectedTabChanged = (id: string) => {
    setSelectedTabId(id);
    window.location.hash = id;
  };

  const renderTabs = () => {
    return tabs.map((tab, index) => (
      <EuiTab
        onClick={() => onSelectedTabChanged(tab.id)}
        isSelected={tab.id === selectedTabId}
        disabled={tab.disabled}
        key={index}
      >
        {tab.name}
      </EuiTab>
    ));
  };

  return (
    <div>
      {newNavigation ? (
        <HeaderControlledComponentsWrapper
          description={{
            text:
              'View integrations with preconfigured assets immediately within your OpenSearch setup.',
            url: OPENSEARCH_DOCUMENTATION_URL,
          }}
          components={IntegrationHeaderActions({ onShowUpload: () => setShowUploadFlyout(true) })}
        />
      ) : (
        <>
          <EuiPageHeader>
            <EuiPageHeaderSection>
              <EuiTitle size="l" data-test-subj="integrations-header">
                <h3>Integrations</h3>
              </EuiTitle>
            </EuiPageHeaderSection>
            <EuiPageHeaderSection>
              <IntegrationHeaderActionsOldNav onShowUpload={() => setShowUploadFlyout(true)} />
            </EuiPageHeaderSection>
          </EuiPageHeader>
          <EuiText size="s" color="subdued">
            View integrations with preconfigured assets immediately within your OpenSearch setup.{' '}
            <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
              Learn more
            </EuiLink>
          </EuiText>
        </>
      )}
      {!newNavigation && <EuiSpacer size="s" />}
      <EuiTabs display="default" size="s">
        {renderTabs()}
      </EuiTabs>
      <EuiSpacer size="s" />
      {showUploadFlyout ? (
        <IntegrationUploadFlyout onClose={() => setShowUploadFlyout(false)} />
      ) : null}
    </div>
  );
};
