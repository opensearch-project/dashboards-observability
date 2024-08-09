/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiAccordion,
  EuiButton,
  EuiCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { coreRefs } from '../../../../public/framework/core_refs';
import { fetchDashboardIds, fetchIndexPatternIds } from './utils';

interface Pattern {
  id: string;
  title: string;
}

interface Dashboard {
  id: string;
  title: string;
}

interface QueryAndAnalyzeProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedTechnology: string;
  selectedDataSourceId: string;
  selectedDataSourceLabel: string;
}

export const QueryAndAnalyze: React.FC<QueryAndAnalyzeProps> = ({
  isOpen,
  onToggle,
  selectedTechnology,
  selectedDataSourceId,
}) => {
  const [patternsContent, setPatternsContent] = useState<Pattern[]>([]);
  const [dashboardsContent, setDashboardsContent] = useState<Dashboard[]>([]);

  const fetchIndexPatternContent = async () => {
    try {
      const content = await fetchIndexPatternIds(selectedTechnology);
      setPatternsContent(content.data.length !== 0 ? content.data : []);
    } catch (error) {
      console.error('Error fetching index patterns:', error);
      setPatternsContent([]);
    }

    try {
      const content = await fetchDashboardIds(selectedTechnology);
      setDashboardsContent(content.data.length !== 0 ? content.data : []);
    } catch (error) {
      console.error('Error fetching dashboards:', error);
      setDashboardsContent([]);
    }
  };

  useEffect(() => {
    if (selectedTechnology !== '') {
      fetchIndexPatternContent();
    }
  }, [selectedTechnology, selectedDataSourceId]);

  const handleIndexPatternClick = (patternId: string) => {
    const finalPatternId = selectedDataSourceId
      ? `mds-${selectedDataSourceId}-objectId-${patternId}`
      : patternId;

    coreRefs?.application!.navigateToApp('data-explorer', {
      path: `discover#?_a=(discover:(columns:!(_source),isDirty:!f,sort:!()),metadata:(indexPattern:'${finalPatternId}',view:discover))&_q=(filters:!(),query:(language:kuery,query:''))&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))`,
    });
  };

  const redirectToDashboards = (dashboardId: string) => {
    const finalDashboardId = selectedDataSourceId
      ? `mds-${selectedDataSourceId}-objectId-${dashboardId}`
      : dashboardId;

    coreRefs?.application!.navigateToApp('dashboards', {
      path: `#/view/${finalDashboardId}`,
    });
  };

  return (
    <EuiAccordion
      id="query-and-analyze"
      buttonContent={`Query and analyze data: ${selectedTechnology}`}
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      <EuiPanel>
        <EuiTitle size="m">
          <h3>Query data</h3>
        </EuiTitle>
        <EuiText>
          <p>
            <strong>Explore your data</strong>
          </p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiFlexGroup wrap>
          {patternsContent.length !== 0 &&
            patternsContent.map((pattern) => (
              <EuiFlexItem key={pattern.id} style={{ maxWidth: '200px' }}>
                <EuiButton onClick={() => handleIndexPatternClick(pattern.id)}>
                  {pattern.title}
                </EuiButton>
              </EuiFlexItem>
            ))}
        </EuiFlexGroup>
        <EuiHorizontalRule />
        <EuiTitle size="m">
          <h3>Analyze data</h3>
        </EuiTitle>
        <EuiText>
          <p>
            <strong>Visualize your data</strong>
          </p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiFlexGroup wrap>
          {dashboardsContent.length !== 0 &&
            dashboardsContent.map((dashboard) => (
              <EuiFlexItem key={dashboard.id} style={{ maxWidth: '300px' }}>
                <EuiCard
                  icon={<div />}
                  title={dashboard.title}
                  description={`Explore the ${dashboard.title} dashboard`}
                  onClick={() => {
                    redirectToDashboards(dashboard.id);
                  }}
                />
              </EuiFlexItem>
            ))}

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
