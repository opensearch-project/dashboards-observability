/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiAccordion,
  EuiButton,
  EuiCard,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useState } from 'react';
import { coreRefs } from '../../../../public/framework/core_refs';
import { fetchDashboardIds, fetchIndexPatternIds } from './utils';
import { useEffect } from 'react';

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
  const [searchValue, setSearchValue] = useState<string>('');

  const [patternsContent, setPatternsContent] = useState([]);

  // Remove view
  const currentPath = technologyPaths[selectedTechnology];

  const fetchIndexPatternContent = async () =>{
    const content = await fetchIndexPatternIds(currentPath);
    setPatternsContent(content);
  }

  useEffect(() => {
    fetchIndexPatternContent();
  }, [])

  const redirectToDashboards = (path: string) => {
    coreRefs?.application!.navigateToApp('dashboards', {
      path: `#/${path}`,
    });
  };

  const handleIndexPatternClick = (patternId: string) => {
    // console.log(`Redirect to explorer with pattern: ${pattern}`);
    redirectToDiscover(patternId);
  };
  const redirectToDiscover = (indexPatternId: string) => {
    coreRefs?.application!.navigateToApp('data-explorer', {
      path: `discover#?_a=(discover:(columns:!(_source),isDirty:!f,sort:!()),metadata:(indexPattern:'${indexPatternId}',view:discover))&_q=(filters:!(),query:(language:kuery,query:''))&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))`,
    });
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
          {patternsContent.map((pattern) => (
            <EuiFlexItem key={pattern.id} style={{ maxWidth: '200px' }}>
              <EuiButton onClick={() => handleIndexPatternClick(pattern.id)}>{pattern.title}</EuiButton>
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
                const dashboards = await fetchDashboardIds(technologyPaths[selectedTechnology])
                redirectToDashboards(dashboards[0].id);
              }}
            />
          </EuiFlexItem>
          <EuiFlexItem style={{ maxWidth: '300px' }}>
            <EuiCard
              icon={<div />}
              title="Create New Dashboard"
              description="Create a new dashboard to visualize your data"
              onClick={() => {
                redirectToDashboards('dashboards');
              }}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </EuiAccordion>
  );
};
