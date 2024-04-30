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
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import {
  DATACONNECTIONS_BASE,
  INTEGRATIONS_BASE,
  observabilityMetricsID,
} from '../../../../../common/constants/shared';
import {
  DatasourceDetails,
  PrometheusProperties,
} from '../../../../../common/types/data_connections';
import {
  useLoadAccelerationsToCache,
  useLoadDatabasesToCache,
  useLoadTablesToCache,
} from '../../../../../public/framework/catalog_cache/cache_loader';
import { redirectToExplorerS3 } from './associated_objects/utils/associated_objects_tab_utils';
import { coreRefs } from '../../../../framework/core_refs';
import { getRenderCreateAccelerationFlyout } from '../../../../plugin';
import { NoAccess } from '../no_access';
import { AccelerationTable } from './accelerations/acceleration_table';
import { AccessControlTab } from './access_control_tab';
import { AssociatedObjectsTab } from './associated_objects/associated_objects_tab';
import { InactiveDataConnectionCallout } from './inactive_data_connection';
import {
  InstallIntegrationFlyout,
  InstalledIntegrationsTable,
} from './integrations/installed_integrations_table';

const renderCreateAccelerationFlyout = getRenderCreateAccelerationFlyout();

export const DataConnection = (props: { dataSource: string }) => {
  const { dataSource } = props;
  const [datasourceDetails, setDatasourceDetails] = useState<DatasourceDetails>({
    allowedRoles: [],
    name: '',
    description: '',
    connector: 'PROMETHEUS',
    properties: { 'prometheus.uri': 'placeholder' },
    status: 'ACTIVE',
  });
  const [hasAccess, setHasAccess] = useState(true);
  const { http, chrome, application } = coreRefs;
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');

  const {
    loadStatus: databasesLoadStatus,
    startLoading: startLoadingDatabases,
  } = useLoadDatabasesToCache();
  const { loadStatus: tablesLoadStatus, startLoading: startLoadingTables } = useLoadTablesToCache();
  const {
    loadStatus: accelerationsLoadStatus,
    startLoading: startLoadingAccelerations,
  } = useLoadAccelerationsToCache();

  const cacheLoadingHooks = {
    databasesLoadStatus,
    startLoadingDatabases,
    tablesLoadStatus,
    startLoadingTables,
    accelerationsLoadStatus,
    startLoadingAccelerations,
  };

  const [dataSourceIntegrations, setDataSourceIntegrations] = useState(
    [] as IntegrationInstanceResult[]
  );
  const [refreshIntegrationsFlag, setRefreshIntegrationsFlag] = useState(false);
  const refreshInstances = () => setRefreshIntegrationsFlag((prev) => !prev);

  useEffect(() => {
    const searchDataSourcePattern = new RegExp(
      `flint_${_.escapeRegExp(datasourceDetails.name)}_default_.*`
    );
    const findIntegrations = async () => {
      // TODO: we just get all results and filter, ideally we send a filtering query to the API
      // Should still be probably okay until we get cases of 500+ integration instances
      const result: { data: IntegrationInstancesSearchResult } = await http!.get(
        INTEGRATIONS_BASE + `/store`
      );
      if (result.data?.hits) {
        setDataSourceIntegrations(
          result.data.hits.filter((res) => res.dataSource.match(searchDataSourcePattern))
        );
      } else {
        setDataSourceIntegrations([]);
      }
    };
    findIntegrations();
  }, [http, datasourceDetails.name, refreshIntegrationsFlag]);

  const [showIntegrationsFlyout, setShowIntegrationsFlyout] = useState(false);
  const onclickIntegrationsCard = () => {
    setShowIntegrationsFlyout(true);
  };
  const integrationsFlyout = showIntegrationsFlyout ? (
    <InstallIntegrationFlyout
      closeFlyout={() => setShowIntegrationsFlyout(false)}
      datasourceType={datasourceDetails.connector}
      datasourceName={datasourceDetails.name}
    />
  ) : null;

  const onclickAccelerationsCard = () => {
    renderCreateAccelerationFlyout(dataSource);
  };

  const onclickDiscoverCard = () => {
    redirectToExplorerS3(dataSource);
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
              children: 'Query in Observability Logs',
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const fetchSelectedDatasource = () => {
    http!
      .get(`${DATACONNECTIONS_BASE}/${dataSource}`)
      .then((data) => {
        setDatasourceDetails({
          allowedRoles: data.allowedRoles,
          description: data.description,
          name: data.name,
          connector: data.connector,
          properties: data.properties,
          status: data.status,
        });
      })
      .catch((_err) => {
        setHasAccess(false);
      });
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
    fetchSelectedDatasource();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chrome, http]);

  const genericTabs = [
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

  const conditionalTabs =
    datasourceDetails.connector === 'S3GLUE'
      ? [
          {
            id: 'associated_objects',
            name: 'Associated Objects',
            disabled: false,
            content: (
              <AssociatedObjectsTab
                datasource={datasourceDetails}
                cacheLoadingHooks={cacheLoadingHooks}
                selectedDatabase={selectedDatabase}
                setSelectedDatabase={setSelectedDatabase}
              />
            ),
          },
          {
            id: 'acceleration_table',
            name: 'Accelerations',
            disabled: false,
            content: (
              <AccelerationTable
                dataSourceName={dataSource}
                cacheLoadingHooks={cacheLoadingHooks}
              />
            ),
          },
          {
            id: 'installed_integrations',
            name: 'Installed Integrations',
            disabled: false,
            content: (
              <InstalledIntegrationsTable
                integrations={dataSourceIntegrations}
                datasourceType={datasourceDetails.connector}
                datasourceName={datasourceDetails.name}
                refreshInstances={refreshInstances}
              />
            ),
          },
        ]
      : [];

  const tabs = [...conditionalTabs, ...genericTabs];

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

        {integrationsFlyout}

        {datasourceDetails.status !== 'ACTIVE' ? (
          <InactiveDataConnectionCallout
            datasourceDetails={datasourceDetails}
            fetchSelectedDatasource={fetchSelectedDatasource}
          />
        ) : (
          <>
            <EuiAccordion
              id="queryOrAccelerateAccordion"
              buttonContent={'Get started'}
              initialIsOpen={true}
              paddingSize="m"
            >
              <QueryOrAccelerateData />
            </EuiAccordion>
            <EuiTabbedContent tabs={tabs} />
          </>
        )}

        <EuiSpacer />
      </EuiPageBody>
    </EuiPage>
  );
};
export { DatasourceDetails };
