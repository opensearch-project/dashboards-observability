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

const APM_DOCS_URL = 'https://docs.opensearch.org/latest/observing-your-data/';

interface TabContent {
  id: string;
  name: string;
  description: string;
}

const tabs: TabContent[] = [
  {
    id: 'services',
    name: 'Services',
    description:
      'Monitor service health, latency, and error rates. View detailed metrics for each service in your distributed system.',
  },
  {
    id: 'application-map',
    name: 'Application Map',
    description:
      'Visualize service dependencies and topology. Understand how your services communicate and identify bottlenecks.',
  },
  {
    id: 'correlate-traces-logs',
    name: 'Correlate traces and logs',
    description:
      'Connect distributed traces with log data. Quickly navigate from trace spans to related logs for faster debugging.',
  },
  {
    id: 'slo-alerts',
    name: 'SLO alerts',
    description:
      'Set and monitor Service Level Objectives. Get alerted when your services fall below target performance thresholds.',
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
          <h1>Start monitoring applications with OpenSearch</h1>
        </EuiText>

        <EuiSpacer size="l" />

        <EuiFlexGroup justifyContent="center" gutterSize="m">
          <EuiFlexItem grow={false}>
            <EuiButton fill onClick={onGetStartedClick}>
              Get started
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        <EuiFlexGroup justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiLink href={APM_DOCS_URL} target="_blank" external={false}>
              View documentation
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
            alt={`${selectedTab.name} preview`}
            style={{ width: '100%', display: 'block' }}
          />
        </div>

        <EuiSpacer size="xxl" />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
