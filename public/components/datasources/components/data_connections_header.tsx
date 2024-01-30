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
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/data_connections';

const tabs = [
  {
    id: 'manage',
    name: 'Manage data sources',
    disabled: false,
  },
  {
    id: 'new',
    name: 'New data source',
    disabled: false,
  },
];

export const DataConnectionsHeader = () => {
  const location = useLocation().pathname.substring(1);

  const [selectedTabId, setSelectedTabId] = useState(location ? location : 'manage');

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
        data-test-subj={tab.id}
      >
        {tab.name}
      </EuiTab>
    ));
  };

  return (
    <div>
      <EuiPageHeader>
        <EuiPageHeaderSection>
          <EuiTitle size="l" data-test-subj="dataconnections-header">
            <h1>Data sources</h1>
          </EuiTitle>
        </EuiPageHeaderSection>
      </EuiPageHeader>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Connect and manage compatible OpenSearch and OpenSearch Dashboards data sources.{' '}
        <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
          Learn more
        </EuiLink>
      </EuiText>
      <EuiSpacer size="l" />
      <EuiTabs display="condensed">{renderTabs()}</EuiTabs>
      <EuiSpacer size="s" />
    </div>
  );
};
