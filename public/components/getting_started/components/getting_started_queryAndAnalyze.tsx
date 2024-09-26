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
} from '@elastic/eui';
import { coreRefs } from '../../../../public/framework/core_refs';
import { fetchDashboardIds, fetchIndexPatternIds, redirectToDashboards } from './utils';
import { getWorkspaceIdFromUrl } from '../../../../../../src/core/public/utils';

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

    const currentUrl = window.location.href;
    const workspaceId = getWorkspaceIdFromUrl(currentUrl, coreRefs?.http!.basePath.getBasePath());

    const workspacePatternId = workspaceId
      ? `workspaceId-${workspaceId}-${finalPatternId}`
      : finalPatternId;

    coreRefs?.application!.navigateToApp('data-explorer', {
      path: `discover#?_a=(discover:(columns:!(_source),isDirty:!f,sort:!()),metadata:(indexPattern:'${workspacePatternId}',view:discover))&_q=(filters:!(),query:(language:kuery,query:''))&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))`,
    });
  };

  const redirectToDashboardsMDS = (dashboardId: string) => {
    const finalDashboardId = selectedDataSourceId
      ? `mds-${selectedDataSourceId}-objectId-${dashboardId}`
      : dashboardId;

    const currentUrl = window.location.href;
    const workspaceId = getWorkspaceIdFromUrl(currentUrl, coreRefs?.http!.basePath.getBasePath());

    const workspaceDashboardId = workspaceId
      ? `workspaceId-${workspaceId}-${finalDashboardId}`
      : finalDashboardId;
    const dashboardUrl = `#/view/${workspaceDashboardId}`;

    coreRefs?.application!.navigateToApp('dashboards', {
      path: dashboardUrl,
    });
  };

  return (
    <EuiPanel paddingSize="m">
      <EuiAccordion
        id="query-and-analyze"
        buttonContent={`Query and analyze data: ${selectedTechnology}`}
        paddingSize="m"
        forceState={isOpen ? 'open' : 'closed'}
        onToggle={onToggle}
      >
        <EuiText>
          <p>
            <h2>Explore your data</h2>
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
        <EuiText>
          <p>
            <h2>Visualize your data</h2>
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
                    redirectToDashboardsMDS(dashboard.id);
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
      </EuiAccordion>
    </EuiPanel>
  );
};
