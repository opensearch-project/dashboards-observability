/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiButtonIcon,
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
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import _ from 'lodash';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';
import { ASSET_FILTER_OPTIONS } from '../../../../common/constants/integrations';
import { INTEGRATIONS_BASE, OBSERVABILITY_BASE } from '../../../../common/constants/shared';
import { DeleteModal } from '../../common/helpers/delete_modal';
import { AddedIntegrationProps } from './integration_types';
import { useToast } from '../../../../public/components/common/toast';

export function AddedIntegration(props: AddedIntegrationProps) {
  const { http, integrationInstanceId, chrome } = props;

  const { setToast } = useToast();

  const [stateData, setData] = useState<any>({ data: {} });

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

  const badge = (status: string) => {
    switch (status) {
      case 'available':
        return <EuiHealth color="success">Active</EuiHealth>;
      case 'partially-available':
        return <EuiHealth color="warning">Partially Available</EuiHealth>;
      default:
        return <EuiHealth color="danger">Critical</EuiHealth>;
    }
  };

  const getModal = () => {
    setModalLayout(
      <DeleteModal
        onConfirm={() => {
          setIsModalVisible(false);
          deleteAddedIntegration(integrationInstanceId);
        }}
        onCancel={() => {
          setIsModalVisible(false);
        }}
        title={`Delete Assets`}
        message={`Are you sure you want to delete the selected asset(s)?`}
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

  function AddedOverview(overviewProps: any) {
    const { data } = overviewProps.data;

    return (
      <EuiPageHeader style={{ justifyContent: 'spaceBetween' }}>
        <EuiSpacer size="m" />
        <EuiPageHeaderSection style={{ width: '100%', justifyContent: 'space-between' }}>
          <EuiPageContentHeaderSection>
            <EuiFlexGroup gutterSize="xs">
              <EuiFlexGroup>
                <EuiFlexItem grow={false}>
                  <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                    <h1>{data?.name}</h1>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem style={{ justifyContent: 'center' }}>
                  {badge(data?.status)}
                </EuiFlexItem>
              </EuiFlexGroup>

              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  iconType="trash"
                  aria-label="Delete"
                  color="danger"
                  onClick={() => {
                    getModal();
                  }}
                  data-test-subj="deleteInstanceButton"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPageContentHeaderSection>
          <EuiSpacer />
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiText>
                <h4>Template</h4>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiLink href={`#/available/${data?.templateName}`}>{data?.templateName}</EuiLink>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText>
                <h4>Date Added</h4>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiText size="m">{data?.creationDate?.split('T')[0]}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageHeaderSection>
      </EuiPageHeader>
    );
  }

  function AddedAssets(assetProps: any) {
    const { data } = assetProps.data;

    const assets = data?.assets || [];

    const renderAsset = (record: any) => {
      switch (record.assetType) {
        case 'dashboard':
          return (
            <EuiLink
              data-test-subj={`IntegrationAssetLink`}
              data-click-metric-element="integrations.dashboard_link"
              onClick={() => window.location.assign(`dashboards#/view/${record.assetId}`)}
            >
              {_.truncate(record.description, { length: 100 })}
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
              {_.truncate(record.description, { length: 100 })}
            </EuiLink>
          );
        case 'search':
          return (
            <EuiLink
              data-test-subj={`IntegrationIndexPatternLink`}
              data-click-metric-element="integrations.search_link"
              onClick={() => window.location.assign(`discover#/view/${record.assetId}`)}
            >
              {_.truncate(record.description, { length: 100 })}
            </EuiLink>
          );
        case 'visualization':
          return (
            <EuiLink
              data-test-subj={`IntegrationIndexPatternLink`}
              data-click-metric-element="integrations.viz-link"
              onClick={() => window.location.assign(`visualize#/edit/${record.assetId}`)}
            >
              {_.truncate(record.description, { length: 100 })}
            </EuiLink>
          );
        default:
          return (
            <EuiText data-test-subj={`IntegrationAssetText`}>
              {_.truncate(record.description, { length: 100 })}
            </EuiText>
          );
      }
    };

    const search = {
      box: {
        incremental: true,
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
        render: (value, record) => (
          <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
            {_.truncate(record.assetType, { length: 100 })}
          </EuiText>
        ),
      },
    ] as Array<EuiTableFieldDataColumnType<any>>;

    return (
      <EuiPanel>
        <PanelTitle title={'Assets List'} />
        <EuiSpacer size="l" />
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
        <EuiSpacer size="xl" />
        {AddedOverview({ data: stateData })}
        <EuiSpacer />
        {AddedAssets({ data: stateData })}
        <EuiSpacer />
      </EuiPageBody>
      {isModalVisible && modalLayout}
    </EuiPage>
  );
}
