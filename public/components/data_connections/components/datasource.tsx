/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTitle,
  EuiText,
  EuiPanel,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiAccordion,
  EuiIcon,
  EuiCard,
  EuiTab,
  EuiTabs,
  EuiTabbedContent,
} from '@elastic/eui';
import React, { Fragment, useEffect, useState } from 'react';
import { DATASOURCES_BASE } from '../../../../common/constants/shared';
import { AccessControlTab } from './access_control_tab';

interface DatasourceDetails {
  allowedRoles: string[];
  name: string;
  cluster: string;
}

export function DataSource(props: any) {
  const { dataSource, pplService, http } = props;
  const [datasourceDetails, setDatasourceDetails] = useState<DatasourceDetails>({
    allowedRoles: [],
    name: '',
    cluster: '',
  });

  useEffect(() => {
    http.get(`${DATASOURCES_BASE}/${dataSource}`).then((data) =>
      setDatasourceDetails({
        allowedRoles: data.allowedRoles,
        name: data.name,
        cluster: data.properties['emr.cluster'],
      })
    );
  }, []);

  const tabs = [
    {
      id: 'data',
      name: 'Data',
      disabled: false,
      content: <></>,
    },
    {
      id: 'access_control',
      name: 'Access control',
      disabled: false,
      content: <AccessControlTab />,
    },
    {
      id: 'connection_configuration',
      name: 'Connection configuration',
      disabled: false,
      content: <></>,
    },
  ];

  const [selectedTabId, setSelectedTabId] = useState('data');

  const onSelectedTabChanged = (id) => {
    setSelectedTabId(id);
  };

  const renderTabs = () => {
    return tabs.map((tab, index) => (
      <EuiTab
        onClick={() => onSelectedTabChanged(tab.id)}
        isSelected={tab.id === selectedTabId}
        disabled={tab.disabled}
        key={index}
      >
        {tab.name}
      </EuiTab>
    ));
  };

  const renderOverview = () => {
    return (
      <EuiPanel>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Connection title</EuiText>
                <EuiText size="s" className="overview-content">
                  {datasourceDetails.name || '-'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Access control</EuiText>
                <EuiText size="s" className="overview-content">
                  {datasourceDetails.allowedRoles && datasourceDetails.allowedRoles.length
                    ? datasourceDetails.allowedRoles
                    : '-'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Connection description</EuiText>
                <EuiText size="s" className="overview-content">
                  {datasourceDetails.name || '-'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Connection status</EuiText>
                <EuiText size="s" className="overview-content">
                  {datasourceDetails.cluster || '-'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
      </EuiPanel>
    );
  };

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageHeader style={{ justifyContent: 'spaceBetween' }}>
          <EuiPageHeaderSection style={{ width: '100%', justifyContent: 'space-between' }}>
            <EuiFlexGroup>
              <EuiFlexItem grow={false}>
                <EuiTitle data-test-subj="dataspirceTitle" size="l">
                  <h1>{dataSource}</h1>
                </EuiTitle>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPageHeaderSection>
        </EuiPageHeader>

        {renderOverview()}
        <EuiSpacer />
        <EuiAccordion
          id="queryOrAccelerateAccordion"
          buttonContent="Ways to use in Dashboards"
          initialIsOpen={true}
        >
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiCard
                icon={<EuiIcon size="xxl" type="discoverApp" />}
                title={'Query data'}
                description="Query your data in Data Explorer or Observability Logs."
                onClick={() => {}}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiCard
                icon={<EuiIcon size="xxl" type="bolt" />}
                title={'Accelerate performance'}
                description="Accelerate performance through OpenSearch indexing."
                onClick={() => {}}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiAccordion>
        <EuiTabbedContent tabs={tabs} initialSelectedTab={tabs[0]} autoFocus="selected" />

        <EuiSpacer />
      </EuiPageBody>
    </EuiPage>
  );
}
