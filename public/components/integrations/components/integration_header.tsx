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
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/integrations';

export function IntegrationHeader() {
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

  const onSelectedTabChanged = (id) => {
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
    </div>
  );
}
