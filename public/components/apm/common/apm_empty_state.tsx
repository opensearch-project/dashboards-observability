/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EuiButton,
  EuiLink,
  EuiSpacer,
  EuiText,
  EuiTabs,
  EuiTab,
  EuiImage,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import servicesPreview from './assets/services-preview.png';
import { apmEmptyStateI18nTexts as i18nTexts, getPreviewImageAlt } from './apm_empty_state_i18n';

const APM_DOCS_URL = 'https://docs.opensearch.org/latest/observing-your-data/';

interface TabContent {
  id: string;
  name: string;
  description: string;
}

const tabs: TabContent[] = [
  {
    id: 'services',
    name: i18nTexts.tabs.services.name,
    description: i18nTexts.tabs.services.description,
  },
  {
    id: 'application-map',
    name: i18nTexts.tabs.applicationMap.name,
    description: i18nTexts.tabs.applicationMap.description,
  },
  {
    id: 'correlate-traces-logs',
    name: i18nTexts.tabs.correlateTracesLogs.name,
    description: i18nTexts.tabs.correlateTracesLogs.description,
  },
];

export interface ApmEmptyStateProps {
  onGetStartedClick: () => void;
}

export const ApmEmptyState = ({ onGetStartedClick }: ApmEmptyStateProps) => {
  const [selectedTabId, setSelectedTabId] = useState('services');

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) || tabs[0];

  return (
    <EuiFlexGroup direction="column" alignItems="center" gutterSize="none">
      <EuiFlexItem grow={false}>
        <EuiSpacer size="xxl" />
        <EuiText textAlign="center">
          <h1>{i18nTexts.title}</h1>
        </EuiText>

        <EuiSpacer size="l" />

        <EuiFlexGroup justifyContent="center" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiButton fill onClick={onGetStartedClick}>
              {i18nTexts.getStarted}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        <EuiFlexGroup justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiLink href={APM_DOCS_URL} target="_blank" external={false}>
              {i18nTexts.viewDocs}
            </EuiLink>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="xl" />

        {/* Tabs */}
        <EuiTabs>
          {tabs.map((tab) => (
            <EuiTab
              key={tab.id}
              onClick={() => setSelectedTabId(tab.id)}
              isSelected={tab.id === selectedTabId}
            >
              {tab.name}
            </EuiTab>
          ))}
        </EuiTabs>

        <EuiSpacer size="m" />

        {/* Tab content */}
        <EuiText color="subdued" textAlign="center" size="s">
          <p>{selectedTab.description}</p>
        </EuiText>

        <EuiSpacer size="l" />

        {/* Preview image */}
        <div
          style={{
            border: '1px solid #D3DAE6',
            borderRadius: '6px',
            overflow: 'hidden',
            maxWidth: '900px',
          }}
        >
          <EuiImage
            src={servicesPreview}
            alt={getPreviewImageAlt(selectedTab.name)}
            style={{ width: '100%', display: 'block' }}
          />
        </div>

        <EuiSpacer size="xxl" />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
