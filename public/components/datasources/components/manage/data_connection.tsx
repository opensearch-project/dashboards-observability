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
  EuiTabbedContent,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { AccessControlTab } from './access_control_tab';
import { NoAccess } from '../no_access';
import { DATACONNECTIONS_BASE } from '../../../../../common/constants/shared';
import { coreRefs } from '../../../../framework/core_refs';
import { ConnectionDetails } from './connection_details';

interface DatasourceDetails {
  allowedRoles: string[];
  name: string;
  cluster: string;
  connector: string;
  properties: unknown;
}

export const DataConnection = (props: any) => {
  const { dataSource } = props;
  const [datasourceDetails, setDatasourceDetails] = useState<DatasourceDetails>({
    allowedRoles: [],
    name: '',
    cluster: '',
    connector: '',
    properties: {},
  });
  const [hasAccess, setHasAccess] = useState(true);
  const { http, chrome } = coreRefs;

  useEffect(() => {
    chrome!.setBreadcrumbs([
      {
        text: 'Data sources',
        href: '#/',
      },
      {
        text: `${dataSource}`,
        href: `#/manage/${dataSource}`,
      },
    ]);
    http!
      .get(`${DATACONNECTIONS_BASE}/${dataSource}`)
      .then((data) => {
        setDatasourceDetails({
          allowedRoles: data.allowedRoles,
          name: data.name,
          cluster: data.properties['emr.cluster'],
          connector: data.connector,
          properties: data.properties,
        });
      })
      .catch((err) => {
        setHasAccess(false);
      });
  }, [chrome, http]);

  const tabs = [
    {
      id: 'access_control',
      name: 'Access control',
      disabled: false,
      content: (
        <AccessControlTab
          allowedRoles={datasourceDetails.allowedRoles}
          dataConnection={dataSource}
          connector={datasourceDetails.connector}
          properties={datasourceDetails.properties}
          key={JSON.stringify(datasourceDetails.allowedRoles)}
        />
      ),
    },
    {
      id: 'connection_configuration',
      name: 'Connection configuration',
      disabled: false,
      content: (
        <ConnectionDetails
          allowedRoles={datasourceDetails.allowedRoles}
          dataConnection={dataSource}
          connector={datasourceDetails.connector}
          properties={datasourceDetails.properties}
        />
      ),
    },
  ];

  const DatasourceOverview = () => {
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
                <EuiText className="overview-title">Authentication method</EuiText>
                <EuiText size="s" className="overview-content">
                  {'-'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Data source description</EuiText>
                <EuiText size="s" className="overview-content">
                  {'-'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Query permissions</EuiText>
                <EuiText size="s" className="overview-content">
                  {datasourceDetails.allowedRoles && datasourceDetails.allowedRoles.length
                    ? 'Restricted'
                    : 'Everyone'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Spark data location</EuiText>
                <EuiText size="s" className="overview-content">
                  {'-'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
      </EuiPanel>
    );
  };

  if (!hasAccess) {
    return <NoAccess />;
  }

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

        <DatasourceOverview />
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
        <EuiTabbedContent tabs={tabs} />

        <EuiSpacer />
      </EuiPageBody>
    </EuiPage>
  );
};
