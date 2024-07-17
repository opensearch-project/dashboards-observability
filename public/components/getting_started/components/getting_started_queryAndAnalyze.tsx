/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiPanel,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCard,
  EuiHorizontalRule,
} from '@elastic/eui';

interface QueryAndAnalyzeProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedTechnology: string;
}

export const QueryAndAnalyze: React.FC<QueryAndAnalyzeProps> = ({
  isOpen,
  onToggle,
  selectedTechnology,
}) => {
  const [searchValue, setSearchValue] = useState<string>('');

  return (
    <EuiAccordion
      id="query-and-analyze"
      buttonContent={`Query & Analyze Data: ${selectedTechnology}`}
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      <EuiPanel>
        <EuiTitle size="m">
          <h2>Query Data</h2>
        </EuiTitle>
        <EuiText>
          <p>
            <strong>Explore your data</strong>
          </p>
        </EuiText>
        <EuiFieldSearch
          placeholder="Search..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          isClearable
          aria-label="Use aria labels when no actual label is in use"
        />
        <EuiSpacer size="l" />
        <EuiHorizontalRule />
        <EuiTitle size="m">
          <h2>Analyze Data</h2>
        </EuiTitle>
        <EuiText>
          <p>
            <strong>Visualize your data</strong>
          </p>
        </EuiText>
        <EuiText>
          <p>
            Visualize your data with these recommended out-of-the-box dashboards for your data, or
            create a new dashboard from scratch.
          </p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiFlexGroup wrap>
          <EuiFlexItem style={{ maxWidth: '300px' }}>
            <EuiCard
              icon={<div />}
              title="Create New Dashboard"
              description="Create a new dashboard to visualize your data"
              onClick={() => {
                /* Handle card click */
              }}
            />
          </EuiFlexItem>
          <EuiFlexItem style={{ maxWidth: '300px' }}>
            <EuiCard
              icon={<div />}
              title={selectedTechnology}
              description={`Explore the ${selectedTechnology} dashboard`}
              onClick={() => {
                /* Handle card click */
              }}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </EuiAccordion>
  );
};
