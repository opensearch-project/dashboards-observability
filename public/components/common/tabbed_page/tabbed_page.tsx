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

interface TabbedPageProps {
  tabNames: Array<[string, string]>;
  header: JSX.Element;
}

export function TabbedPage(props: TabbedPageProps) {
  const { tabNames, header } = props;
  const tabs = tabNames.map((tabName: [string, string]) => {
    return { id: tabName[0], name: tabName[1] };
  });

  const [selectedTabId, setSelectedTabId] = useState(
    window.location.hash.substring(2) ? window.location.hash.substring(2) : tabs && tabs.at(-1).id
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
        key={index}
      >
        {tab.name}
      </EuiTab>
    ));
  };
  return (
    <div>
      {header}
      <EuiTabs display="condensed">{renderTabs()}</EuiTabs>
      <EuiSpacer size="s" />
    </div>
  );
}
