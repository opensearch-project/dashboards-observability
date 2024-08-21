/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPopover,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useState } from 'react';
import {
  OPENSEARCH_CATALOG_URL,
  OPENSEARCH_DOCUMENTATION_URL,
} from '../../../../common/constants/integrations';
import { IntegrationUploadFlyout } from './upload_flyout';

export const IntegrationHeaderActions = ({ onShowUpload }: { onShowUpload: () => void }) => {
  const [isPopoverOpen, setPopover] = useState(false);

  const closePopover = () => {
    setPopover(false);
  };

  const onButtonClick = () => {
    setPopover((isOpen) => !isOpen);
  };

  const items = [
    <EuiContextMenuItem
      onClick={() => {
        closePopover(); // If the popover isn't closed, it overlays over the flyout
        onShowUpload();
      }}
    >
      Upload Integrations
    </EuiContextMenuItem>,
    <EuiContextMenuItem href={OPENSEARCH_CATALOG_URL}>View Catalog</EuiContextMenuItem>,
  ];
  const button = (
    <EuiSmallButton iconType="arrowDown" fill={true} onClick={onButtonClick}>
      Catalog
    </EuiSmallButton>
  );
  return (
    <EuiPopover
      id="integHeaderActionsPanel"
      button={button}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
    >
      <EuiContextMenuPanel items={items} />
    </EuiPopover>
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
      <EuiPageHeader>
        <EuiPageHeaderSection>
          <EuiTitle size="l" data-test-subj="integrations-header">
            <h1>Integrations</h1>
          </EuiTitle>
        </EuiPageHeaderSection>
        <EuiPageHeaderSection>
          <IntegrationHeaderActions onShowUpload={() => setShowUploadFlyout(true)} />
        </EuiPageHeaderSection>
      </EuiPageHeader>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        View integrations with preconfigured assets immediately within your OpenSearch setup.{' '}
        <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
          Learn more
        </EuiLink>
      </EuiText>
      <EuiSpacer size="l" />
      <EuiTabs display="condensed">{renderTabs()}</EuiTabs>
      <EuiSpacer size="s" />
      {showUploadFlyout ? (
        <IntegrationUploadFlyout onClose={() => setShowUploadFlyout(false)} />
      ) : null}
    </div>
  );
};
