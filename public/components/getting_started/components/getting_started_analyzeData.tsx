/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiAccordion,
  EuiPanel,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCard,
} from '@elastic/eui';

interface AnalyzeDataProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedTechnology: string;
}

export const AnalyzeData: React.FC<AnalyzeDataProps> = ({
  isOpen,
  onToggle,
  selectedTechnology,
}) => {
  return (
    <EuiAccordion
      id="analyze-data"
      buttonContent={`Analyze Data: ${selectedTechnology}`}
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      <EuiPanel>
        <EuiTitle size="m">
          <h2>Visualize Your Data</h2>
        </EuiTitle>
        <EuiText>
          <p>View your pre-canned out-of-the-box dashboard or create one on your own.</p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiButton>Create New Dashboard</EuiButton>
        <EuiSpacer size="m" />
        <EuiFlexGroup gutterSize="l">
          <EuiFlexItem style={{ minWidth: '14rem', maxWidth: '14rem' }}>
            <EuiCard
              layout="vertical"
              title="Dashboard A"
              description="Pre-built dashboard for monitoring."
              onClick={() => {
                /* Handle click for Dashboard A */
              }}
            />
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: '14rem', maxWidth: '14rem' }}>
            <EuiCard
              layout="vertical"
              title="Dashboard B"
              description="Another pre-built dashboard for analytics."
              onClick={() => {
                /* Handle click for Dashboard B */
              }}
            />
          </EuiFlexItem>
          <EuiFlexItem style={{ minWidth: '14rem', maxWidth: '14rem' }}>
            <EuiCard
              layout="vertical"
              title="Trace Analytics"
              description="Dashboard for tracing and analyzing logs."
              onClick={() => {
                /* Handle click for Trace Analytics */
              }}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </EuiAccordion>
  );
};
