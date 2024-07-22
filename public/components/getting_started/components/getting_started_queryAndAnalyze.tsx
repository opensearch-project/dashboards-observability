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
  EuiFlexGroup,
  EuiFlexItem,
  EuiCard,
  EuiHorizontalRule,
  EuiButton,
} from '@elastic/eui';
import { coreRefs } from '../../../../public/framework/core_refs';

interface QueryAndAnalyzeProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedTechnology: string;
  indexPatterns: string[];
}

const technologyPaths: Record<string, string> = {
  OTEL: 'view/c39012d0-eb7a-11ed-8e00-17d7d50cd7b2',
  CSV: 'view/c39012d0-eb7a-11ed-8e00-17d7d50cd7b2',
  Golang: 'view/c39012d0-eb7a-11ed-8e00-17d7d50cd7b2',
  Python: 'view/c39012d0-eb7a-11ed-8e00-17d7d50cd7b2',
};

export const QueryAndAnalyze: React.FC<QueryAndAnalyzeProps> = ({
  isOpen,
  onToggle,
  selectedTechnology,
  indexPatterns,
}) => {
  const redirectToExplorer = (path: string) => {
    coreRefs?.application!.navigateToApp('dashboards', {
      path: `#/${path}`,
    });
  };

  const handleIndexPatternClick = (pattern: string) => {
    console.log(`Redirect to explorer with pattern: ${pattern}`);
    redirectToExplorer(`dashboards#/view/${pattern}`);
  };

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
        <EuiSpacer size="m" />
        <EuiFlexGroup wrap>
          {indexPatterns.map((pattern) => (
            <EuiFlexItem key={pattern} style={{ maxWidth: '200px' }}>
              <EuiButton onClick={() => handleIndexPatternClick(pattern)}>{pattern}</EuiButton>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
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
              title={selectedTechnology}
              description={`Explore the ${selectedTechnology} dashboard`}
              onClick={() => {
                redirectToExplorer(technologyPaths[selectedTechnology]);
              }}
            />
          </EuiFlexItem>
          <EuiFlexItem style={{ maxWidth: '300px' }}>
            <EuiCard
              icon={<div />}
              title="Create New Dashboard"
              description="Create a new dashboard to visualize your data"
              onClick={() => {
                redirectToExplorer('dashboards');
              }}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </EuiAccordion>
  );
};
