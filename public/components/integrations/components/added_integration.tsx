/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiInMemoryTable,
  EuiLink,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPageContentHeaderSection,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiPanel,
  EuiSmallButtonIcon,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import truncate from 'lodash/truncate';
import React, { useEffect, useState } from 'react';
import { FormattedMessage } from '@osd/i18n/react';
import { DataSourceViewConfig } from '../../../../../../src/plugins/data_source_management/public';
import { ASSET_FILTER_OPTIONS } from '../../../../common/constants/integrations';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { dataSourceFilterFn } from '../../../../common/utils/shared';
import { useToast } from '../../../../public/components/common/toast';
import { HeaderControlledComponentsWrapper } from '../../../../public/plugin_helpers/plugin_headerControl';
import { coreRefs } from '../../../framework/core_refs';
import { DeleteModal } from '../../common/helpers/delete_modal';
import { AddedIntegrationProps } from './integration_types';

const newNavigation = coreRefs.chrome?.navGroup.getNavGroupEnabled();

export const IntegrationHealthBadge = ({ status }: { status?: string }) => {
  switch (status) {
    case undefined:
      return <EuiHealth color="warning">Unknown</EuiHealth>;
    case 'available':
      return <EuiHealth color="success">Active</EuiHealth>;
    case 'partially-available':
      return <EuiHealth color="warning">Partially Available</EuiHealth>;
    default:
      return <EuiHealth color="danger">Critical</EuiHealth>;
  }
};

export function AddedIntegration(props: AddedIntegrationProps) {
  const {
    http,
    integrationInstanceId,
    chrome,
    dataSourceEnabled,
    dataSourceManagement,
    setActionMenu,
  } = props;

  const { setToast } = useToast();

  const [stateData, setData] = useState<{ data: IntegrationInstanceResult | undefined }>({
    data: undefined,
  });

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Integrations',
        href: '#/',
      },
      {
        text: 'Installed Integrations',
        href: '#/installed',
      },
      {
        text: `${stateData.data?.name}`,
        href: `#/installed/${stateData.data?.id}`,
      },
    ]);
    handleDataRequest();
  }, [integrationInstanceId, stateData.data?.name]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);

  const DataSourceMenu = dataSourceManagement?.ui?.getDataSourceMenu<DataSourceViewConfig>();

  const activateDeleteModal = () => {
    setModalLayout(
      <DeleteModal
        onConfirm={() => {
          setIsModalVisible(false);
          deleteAddedIntegration(integrationInstanceId);
        }}
        onCancel={() => {
          setIsModalVisible(false);
        }}
        title={`Delete Integration`}
        message={`Are you sure you want to delete the selected Integration?`}
      />
    );
    setIsModalVisible(true);
  };

  async function deleteAddedIntegration(integrationInstance: string) {
    http
      .delete(`${INTEGRATIONS_BASE}/store/${integrationInstance}`)
      .then(() => {
        setToast(`${stateData.data?.name} integration successfully deleted!`, 'success');
      })
      .catch((err) => {
        console.error(err);
        setToast(`Error deleting ${stateData.data?.name} or its assets`, 'danger');
      })
      .finally(() => {
        window.location.hash = '#/installed';
      });
  }

  async function handleDataRequest() {
    http
      .get(`${INTEGRATIONS_BASE}/store/${integrationInstanceId}`)
      .then((exists) => setData(exists));
  }

  function AddedOverview(overviewProps: { data: { data?: IntegrationInstanceResult } }) {
    const { data } = overviewProps.data;

    const badgeContent = <IntegrationHealthBadge status={data?.status} />;

    const deleteButton = (
      <EuiToolTip
        content={
          <FormattedMessage
            id="integration.deleteButtonTooltip"
            defaultMessage="Delete this instance"
          />
        }
      >
        <EuiSmallButtonIcon
          display="base"
          iconType="trash"
          aria-label="Delete"
          color="danger"
          onClick={() => {
            activateDeleteModal(data?.name);
          }}
          data-test-subj="deleteInstanceButton"
        />
      </EuiToolTip>
    );

    const headerContent = (
      <EuiPageContentHeaderSection>
        <EuiFlexGroup gutterSize="xs" justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiText data-test-subj="eventHomePageTitle" size="s">
                  <h1>{data?.name}</h1>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>{badgeContent}</EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{deleteButton}</EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageContentHeaderSection>
    );

    const additionalInfo = (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiText size="m">
            <h4>Template</h4>
          </EuiText>
          <EuiLink href={`#/available/${data?.templateName}`}>{data?.templateName}</EuiLink>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="m">
            <h4>Date Added</h4>
          </EuiText>
          <EuiText size="m">{data?.creationDate?.split('T')[0]}</EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );

    return newNavigation ? (
      <>
        <HeaderControlledComponentsWrapper
          badgeContent={<IntegrationHealthBadge status={data?.status} />}
          components={[
            ...(dataSourceEnabled
              ? [
                  <DataSourceMenu
                    setMenuMountPoint={setActionMenu}
                    componentType={'DataSourceView'}
                    componentConfig={{
                      activeOption: [
                        {
                          id: data?.references?.[0]?.id ?? '',
                          label: data?.references?.[0]?.name ?? '',
                        },
                      ],
                      fullWidth: true,
                      dataSourceFilter: dataSourceFilterFn,
                    }}
                  />,
                ]
              : []),
            deleteButton,
          ]}
        />
        <EuiPanel>{additionalInfo}</EuiPanel>
      </>
    ) : (
      <>
        <EuiPageHeader style={{ justifyContent: 'spaceBetween' }}>
          {dataSourceEnabled && (
            <DataSourceMenu
              setMenuMountPoint={setActionMenu}
              componentType={'DataSourceView'}
              componentConfig={{
                activeOption: [
                  {
                    id: data?.references?.[0]?.id,
                    label: data?.references?.[0]?.name,
                  },
                ],
                fullWidth: true,
                dataSourceFilter: dataSourceFilterFn,
              }}
            />
          )}
          <EuiPageHeaderSection style={{ width: '100%', justifyContent: 'space-between' }}>
            {headerContent}
          </EuiPageHeaderSection>
        </EuiPageHeader>
        <EuiPanel>{additionalInfo}</EuiPanel>
      </>
    );
  }

  function AddedAssets(assetProps: { data: { data?: { assets: AssetReference[] } } }) {
    const { data } = assetProps.data;

    const assets = data?.assets || [];

    const renderAsset = (record: AssetReference) => {
      switch (record.assetType) {
        case 'dashboard':
          return (
            <EuiLink
              data-test-subj={`IntegrationAssetLink`}
              data-click-metric-element="integrations.dashboard_link"
              onClick={() => window.location.assign(`dashboards#/view/${record.assetId}`)}
            >
              {truncate(record.description, { length: 100 })}
            </EuiLink>
          );
        case 'index-pattern':
          return (
            <EuiLink
              data-test-subj={`IntegrationIndexPatternLink`}
              data-click-metric-element="integrations.index-pattern_link"
              onClick={() =>
                window.location.assign(
                  `management/opensearch-dashboards/indexPatterns/patterns/${record.assetId}`
                )
              }
            >
              {truncate(record.description, { length: 100 })}
            </EuiLink>
          );
        case 'search':
          return (
            <EuiLink
              data-test-subj={`IntegrationIndexPatternLink`}
              data-click-metric-element="integrations.search_link"
              onClick={() => window.location.assign(`discover#/view/${record.assetId}`)}
            >
              {truncate(record.description, { length: 100 })}
            </EuiLink>
          );
        case 'visualization':
          return (
            <EuiLink
              data-test-subj={`IntegrationIndexPatternLink`}
              data-click-metric-element="integrations.viz-link"
              onClick={() => window.location.assign(`visualize#/edit/${record.assetId}`)}
            >
              {truncate(record.description, { length: 100 })}
            </EuiLink>
          );
        case 'observability-search':
          return (
            <EuiLink
              data-test-subj={`SavedQueryLink`}
              data-click-metric-element="integrations.saved_query_link"
              onClick={() =>
                window.location.assign(
                  `observability-logs#/explorer/observability-search:${record.assetId}`
                )
              }
            >
              {truncate(record.description, { length: 100 })}
            </EuiLink>
          );
        default:
          return (
            <EuiText data-test-subj={`IntegrationAssetText`}>
              {truncate(record.description, { length: 100 })}
            </EuiText>
          );
      }
    };

    const search = {
      box: {
        incremental: true,
        compressed: true,
      },
      filters: [
        {
          type: 'field_value_selection' as const,
          field: 'assetType',
          name: 'Type',
          multiSelect: false,
          options: ASSET_FILTER_OPTIONS.map((i) => ({
            value: i,
            name: i,
            view: i,
          })),
        },
      ],
      compressed: true,
    };

    const tableColumns = [
      {
        field: 'name',
        name: 'Name',
        sortable: true,
        truncateText: true,
        render: (value, record) => {
          return renderAsset(record);
        },
      },
      {
        field: 'type',
        name: 'Type',
        sortable: true,
        truncateText: true,
        render: (_value, record) => (
          <EuiText data-test-subj={`${record.assetType}AssetTypeDescription`}>
            {truncate(record.assetType, { length: 100 })}
          </EuiText>
        ),
      },
    ] as Array<EuiTableFieldDataColumnType<AssetReference>>;

    return (
      <EuiPanel>
        <EuiTitle size="s">
          <h3>Assets List</h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiInMemoryTable
          itemId="id"
          loading={false}
          items={assets}
          columns={tableColumns}
          pagination={{
            initialPageSize: 10,
            pageSizeOptions: [5, 10, 15],
          }}
          search={search}
        />
      </EuiPanel>
    );
  }

  return (
    <EuiPage>
      <EuiPageBody>
        {AddedOverview({ data: stateData })}
        <EuiSpacer size="s" />
        {AddedAssets({ data: stateData })}
        <EuiSpacer size="s" />
      </EuiPageBody>
      {isModalVisible && modalLayout}
    </EuiPage>
  );
}
