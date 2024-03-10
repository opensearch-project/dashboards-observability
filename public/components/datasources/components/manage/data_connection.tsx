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
  useLoadAccelerationsToCache,
  useLoadDatabasesToCache,
  useLoadTablesToCache,
} from '../../../../../public/framework/catalog_cache/cache_loader';
import { DirectQueryLoadingStatus } from '../../../../../common/types/explorer';
import { CatalogCacheManager } from '../../../../../public/framework/catalog_cache/cache_manager';
import {
  DATACONNECTIONS_BASE,
  observabilityIntegrationsID,
  observabilityLogsID,
  observabilityMetricsID,
} from '../../../../../common/constants/shared';
import { coreRefs } from '../../../../framework/core_refs';
import { getRenderCreateAccelerationFlyout } from '../../../../plugin';
import { NoAccess } from '../no_access';
import {
  CachedAcceleration,
  CachedDatabase,
  CachedTable,
  DatasourceType,
} from '../../../../../common/types/data_connections';
import { AssociatedObjectsTab } from './associated_objects/associated_objects_tab';
import { AccelerationTable } from './accelerations/acceleration_table';
import { AccessControlTab } from './access_control_tab';
import { mockAssociatedObjects } from './associated_objects/utils/associated_objects_tab_utils';

export interface DatasourceDetails {
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
const renderCreateAccelerationFlyout = getRenderCreateAccelerationFlyout();

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
  // const sampleSql = 'select * from `httplogs`.`default`.`table2` limit 10';
  const _dummyAccelerations = [
    {
      flintIndexName: 'flint_mys3_default_http_logs_skipping_index',
      kind: 'skipping',
      database: 'default',
      table: 'test',
      indexName: 'skipping_index',
      autoRefresh: true,
      status: 'Active',
    },
    {
      flintIndexName: 'flint_mys3_default_test_mycv_index',
      kind: 'covering',
      database: 'default',
      table: 'test',
      indexName: 'mycv',
      autoRefresh: false,
      status: 'Active',
    },
    {
      flintIndexName: 'flint_mys3_default_mymv',
      kind: ' ',
      database: 'default',
      table: '',
      indexName: 'mymv',
      autoRefresh: true,
      status: 'Active',
    },
    {
      flintIndexName: 'flint_mys3_default_sample_mv',
      kind: 'mv',
      database: 'default',
      table: 'sample_table',
      indexName: 'sample_mv',
      autoRefresh: true,
      status: 'Active',
    },
  ];

  const onclickIntegrationsCard = () => {
    application!.navigateToApp(observabilityIntegrationsID);
  };

  const onclickAccelerationsCard = () => {
    renderCreateAccelerationFlyout(dataSource);
  };

  const onclickDiscoverCard = () => {
    application!.navigateToApp(observabilityLogsID);
  const [isFirstTimeLoading, setIsFirstTimeLoading] = useState(true);
  const {
    loadStatus: databasesLoadStatus,
    startLoading: startLoadingDatabases,
  } = useLoadDatabasesToCache();
  const { loadStatus: tablesLoadStatus, startLoading: startLoadingTables } = useLoadTablesToCache();
  const {
    loadStatus: accelerationsLoadStatus,
    startLoading: startLoadingAccelerations,
  } = useLoadAccelerationsToCache();
  const [tablesIsLoading, setTablesIsLoading] = useState<boolean>(false);
  const [accelerationsIsLoading, setAccelerationsIsLoading] = useState<boolean>(false);
  const [cachedDatabases, setCachedDatabases] = useState<CachedDatabase[]>([]);
  const [cachedTables, setCachedTables] = useState<CachedTable[]>([]);
  const [cachedAccelerations, setCachedAccelerations] = useState<CachedAcceleration[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const loadDatabases = () => {
    if (datasourceDetails.name) {
      startLoadingDatabases(datasourceDetails.name);
      setIsRefreshing(true);
    }
  };

  const DefaultDatasourceCards = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiCard
            icon={<EuiIcon size="xxl" type="integrationGeneral" />}
            title={'Configure Integrations'}
            description="Connect to common application log types using integrations"
            onClick={onclickIntegrationsCard}
            selectable={{
              onClick: onclickIntegrationsCard,
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
            onClick={onclickAccelerationsCard}
            selectable={{
              onClick: onclickAccelerationsCard,
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
            onClick={onclickDiscoverCard}
            selectable={{
              onClick: onclickDiscoverCard,
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
          associatedObjects={mockAssociatedObjects}
          datasource={datasourceDetails}
          cachedDatabases={cachedDatabases}
          databasesLoadStatus={databasesLoadStatus}
          loadDatabases={loadDatabases}
          selectedDatabase={selectedDatabase}
          setSelectedDatabase={setSelectedDatabase}
          cachedTables={cachedTables}
          tablesLoadStatus={tablesLoadStatus}
          startLoadingTables={startLoadingTables}
          tablesIsLoading={tablesIsLoading}
          cachedAccelerations={cachedAccelerations}
          accelerationsLoadStatus={accelerationsLoadStatus}
          startLoadingAccelerations={startLoadingAccelerations}
          accelerationsIsLoading={accelerationsIsLoading}
          isFirstTimeLoading={isFirstTimeLoading}
          isRefreshing={isRefreshing}
        />
      ),
    },
    {
      id: 'acceleration_table',
      name: 'Accelerations',
      disabled: false,
      content: <AccelerationTable dataSourceName={dataSource} />,
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
                <EuiText className="overview-title">Description</EuiText>
                <EuiText size="s" className="overview-content">
                  {datasourceDetails.description || '-'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Query Access</EuiText>
                <EuiText size="s" className="overview-content">
                  {datasourceDetails.allowedRoles.length > 0
                    ? `Restricted to ${datasourceDetails.allowedRoles.join(', ')}`
                    : 'Admin only'}
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

  useEffect(() => {
    loadDatabases();
  }, [datasourceDetails.name]);

  useEffect(() => {
    const loadingStatuses = [
      DirectQueryLoadingStatus.RUNNING,
      DirectQueryLoadingStatus.SCHEDULED,
      DirectQueryLoadingStatus.WAITING,
    ];
    setTablesIsLoading(loadingStatuses.includes(tablesLoadStatus));
    setAccelerationsIsLoading(loadingStatuses.includes(accelerationsLoadStatus));
    if (databasesLoadStatus === DirectQueryLoadingStatus.SUCCESS) {
      const cachedList: CachedDatabase[] =
        CatalogCacheManager.getDataSourceCache().dataSources.find(
          (cachedDataSource) => cachedDataSource.name === datasourceDetails.name
        )?.databases || [];
      if (cachedList) {
        setCachedDatabases(cachedList);
      }
      setIsRefreshing(false);
      setIsFirstTimeLoading(false);
    }
    if (tablesLoadStatus === DirectQueryLoadingStatus.SUCCESS) {
      const cachedList: CachedTable[] = CatalogCacheManager.getDatabase(
        datasourceDetails.name,
        selectedDatabase
      ).tables;
      if (cachedList) {
        setCachedTables(cachedList);
      }
    }
    if (accelerationsLoadStatus === DirectQueryLoadingStatus.SUCCESS) {
      const cachedList = CatalogCacheManager.getAccelerationsCache().accelerations;
      if (cachedList) {
        setCachedAccelerations(cachedList);
      }
    }
  }, [databasesLoadStatus, tablesLoadStatus, accelerationsLoadStatus]);

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
