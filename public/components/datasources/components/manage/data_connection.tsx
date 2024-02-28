/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiAccordion,
  EuiCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPanel,
  EuiSpacer,
  EuiTabbedContent,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import {
  DATACONNECTIONS_BASE,
  observabilityIntegrationsID,
  observabilityLogsID,
  observabilityMetricsID,
  queryWorkbenchPluginID,
} from '../../../../../common/constants/shared';
import { coreRefs } from '../../../../framework/core_refs';
import { NoAccess } from '../no_access';
import { AccessControlTab } from './access_control_tab';
import { DatasourceType } from '../../../../../common/types/data_connections';
import { AssociatedObjectsTab } from './associated_objects/associated_objects_tab';
import { AccelerationTable } from './accelerations/acceleration_table';

interface DatasourceDetails {
  allowedRoles: string[];
  name: string;
  connector: DatasourceType;
  description: string;
  properties: S3GlueProperties | PrometheusProperties;
}

export interface S3GlueProperties {
  'glue.indexstore.opensearch.uri': string;
  'glue.indexstore.opensearch.region': string;
}

export interface PrometheusProperties {
  'prometheus.uri': string;
}

export const DataConnection = (props: any) => {
  const { dataSource } = props;
  const [datasourceDetails, setDatasourceDetails] = useState<DatasourceDetails>({
    allowedRoles: [],
    name: '',
    description: '',
    connector: 'PROMETHEUS',
    properties: { 'prometheus.uri': 'placeholder' },
  });
  const [hasAccess, setHasAccess] = useState(true);
  const { http, chrome, application } = coreRefs;

  // Dummy accelerations variables for mock purposes
  // Actual accelerations should be retrieved from the backend
  const sampleSql = 'select * from `httplogs`.`default`.`table2` limit 10';
  const dummyAccelerations = [
    {
      name: 'dummy_acceleration_1',
      status: 'ACTIVE',
      type: 'skip',
      database: 'default',
      table: 'table1',
      destination: 'N/A',
      dateCreated: 1709339290,
      dateUpdated: 1709339290,
      index: 'security_logs_2022',
      sql: sampleSql,
    },
  ];

  const DefaultDatasourceCards = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiCard
            icon={<EuiIcon size="xxl" type="integrationGeneral" />}
            title={'Configure Integrations'}
            description="Connect to common application log types using integrations"
            onClick={() => application!.navigateToApp(observabilityIntegrationsID)}
            selectable={{
              onClick: () => {},
              isDisabled: false,
              children: 'Add Integrations',
            }}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            icon={<EuiIcon size="xxl" type="bolt" />}
            title={'Accelerate performance'}
            description="Accelerate query performance through OpenSearch indexing"
            onClick={() =>
              application!.navigateToApp(queryWorkbenchPluginID, {
                path: `#/accelerate/${dataSource}`,
              })
            }
            selectable={{
              onClick: () => {},
              isDisabled: false,
              children: 'Accelerate Performance',
            }}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            icon={<EuiIcon size="xxl" type="discoverApp" />}
            title={'Query data'}
            description="Uncover insights from your data or better understand it"
            onClick={() => application!.navigateToApp(observabilityLogsID)}
            selectable={{
              onClick: () => {},
              isDisabled: false,
              children: 'Query in Discover',
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

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
          description: data.description,
          name: data.name,
          connector: data.connector,
          properties: data.properties,
        });
      })
      .catch((_err) => {
        setHasAccess(false);
      });
  }, [chrome, http]);

  const tabs = [
    {
      id: 'associated_objects',
      name: 'Associated Objects',
      disabled: false,
      content: (
        <AssociatedObjectsTab
          associatedObjects={[
            {
              id: '1',
              name: 'Table_name_1',
              database: 'db1',
              type: 'Table',
              createdByIntegration: 'xx',
              accelerations: 'xxx_skipping1',
            },
            {
              id: '2',
              name: 'Table_name_2',
              database: 'db1',
              type: 'Table',
              createdByIntegration: 'xx',
              accelerations: 'xxx_skipping1',
            },
            {
              id: '3',
              name: 'Table_name_3',
              database: 'db2',
              type: 'Table',
              createdByIntegration: 'xx',
              accelerations: 'xxx_skipping2',
            },
            {
              id: '4',
              name: 'Table_name_4',
              database: 'db2',
              type: 'Table',
              createdByIntegration: 'xx',
              accelerations: 'xxx_skipping2',
            },
            {
              id: '5',
              name: 'Table_name_5',
              database: 'db3',
              type: 'Table',
              createdByIntegration: 'xx',
              accelerations: 'xxx_skipping3',
            },
          ]}
        />
      ),
    },
    {
      id: 'acceleration_table',
      name: 'Accelerations',
      disabled: false,
      content: <AccelerationTable accelerations={dummyAccelerations} />,
    },
    // TODO: Installed integrations page
    {
      id: 'installed_integrations',
      name: 'Installed Integrations',
      disabled: false,
    },
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
  ];

  const QueryOrAccelerateData = () => {
    switch (datasourceDetails.connector) {
      case 'S3GLUE':
        return <DefaultDatasourceCards />;
      case 'PROMETHEUS':
        // Prometheus does not have acceleration or integrations, and should go to metrics analytics
        return (
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiCard
                icon={<EuiIcon size="xxl" type="discoverApp" />}
                title={'Query data'}
                description="Query your data in Metrics Analytics."
                onClick={() => application!.navigateToApp(observabilityMetricsID)}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        );
      default:
        return <DefaultDatasourceCards />;
    }
  };

  const S3DatasourceOverview = () => {
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
                <EuiText className="overview-title">Data source description</EuiText>
                <EuiText size="s" className="overview-content">
                  {datasourceDetails.description || '-'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Index store region</EuiText>
                <EuiText size="s" className="overview-content">
                  {(datasourceDetails.properties as S3GlueProperties)[
                    'glue.indexstore.opensearch.region'
                  ] || '-'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Index store URI</EuiText>
                <EuiText size="s" className="overview-content">
                  {(datasourceDetails.properties as S3GlueProperties)[
                    'glue.indexstore.opensearch.uri'
                  ] || '-'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
      </EuiPanel>
    );
  };

  const PrometheusDatasourceOverview = () => {
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
                <EuiText className="overview-title">Data source description</EuiText>
                <EuiText size="s" className="overview-content">
                  {datasourceDetails.description || '-'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Prometheus URI</EuiText>
                <EuiText size="s" className="overview-content">
                  {(datasourceDetails.properties as PrometheusProperties)['prometheus.uri'] || '-'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
      </EuiPanel>
    );
  };

  const DatasourceOverview = () => {
    switch (datasourceDetails.connector) {
      case 'S3GLUE':
        return <S3DatasourceOverview />;
      case 'PROMETHEUS':
        return <PrometheusDatasourceOverview />;
    }
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
          buttonContent={'Get started'}
          initialIsOpen={true}
          paddingSize="m"
        >
          <QueryOrAccelerateData />
        </EuiAccordion>
        <EuiTabbedContent tabs={tabs} />

        <EuiSpacer />
      </EuiPageBody>
    </EuiPage>
  );
};
