/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiGlobalToastList,
  EuiIcon,
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
import React, { ReactChild, useEffect, useState } from 'react';
import { last } from 'lodash';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import _ from 'lodash';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';
import { FILTER_OPTIONS } from '../../../../common/constants/explorer';
import { INTEGRATIONS_BASE, OBSERVABILITY_BASE } from '../../../../common/constants/shared';
import { DeleteModal } from '../../common/helpers/delete_modal';
import { AddedIntegrationProps } from './integration_types';
import { useToast } from '../../../../public/components/common/toast';

export function AddedIntegration(props: AddedIntegrationProps) {
  const { http, integrationInstanceId, chrome, parentBreadcrumbs } = props;

  const { setToast } = useToast();

  const [stateData, setData] = useState<any>({ data: {} });

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Integrations',
        href: '#/',
      },
      {
        text: 'Added Integration',
        href: '#/added',
      },
      {
        text: `${stateData.data?.name}`,
        href: `#/added/${stateData.data?.id}`,
      },
    ]);
    handleDataRequest();
  }, [integrationInstanceId, stateData.data?.name]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);

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
        window.location.hash = '#/added';
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
      <EuiPageHeader style={{ justifyContent: 'center' }}>
        <EuiSpacer size="m" />
        <EuiPageHeaderSection style={{ width: '80%' }}>
          <EuiPageContentHeaderSection>
            <EuiFlexGroup gutterSize="xs">
              <EuiFlexItem>
                <EuiTitle data-test-subj="eventHomePageTitle" size="l">
                  <h1>{data?.name}</h1>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  size="s"
                  color="danger"
                  onClick={() => {
                    getModal();
                  }}
                  data-test-subj="deleteInstanceButton"
                >
                  Remove Integration
                </EuiButton>
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
            <EuiFlexItem>
              <EuiText>
                <h4>Status</h4>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiText size="m">{data?.status}</EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText>
                <h4>Tags</h4>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiText size="m">{data?.license}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPageHeaderSection>
      </EuiPageHeader>
    );
  }

  function AddedAssets(assetProps: any) {
    const { data } = assetProps.data;

    const assets = data?.assets || [];

    const search = {
      box: {
        incremental: true,
      },
      filters: [
        {
          type: 'field_value_selection',
          field: 'type',
          name: 'Type',
          multiSelect: false,
          options: FILTER_OPTIONS.map((i) => ({
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
          return record.isDefaultAsset ? (
            <EuiLink
              data-test-subj={`IntegrationAssetLink`}
              onClick={() => window.location.assign(`dashboards#/view/${record.assetId}`)}
            >
              {_.truncate(record.description, { length: 100 })}
            </EuiLink>
          ) : (
            <EuiText data-test-subj={`IntegrationAssetText`}>
              {_.truncate(record.description, { length: 100 })}
            </EuiText>
          );
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
      {
        field: 'actions',
        name: 'Actions',
        sortable: true,
        truncateText: true,
        render: (value, record) => (
          <EuiIcon
            type={'trash'}
            onClick={() => {
              getModal();
            }}
          />
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

  function AddedIntegrationFields(fieldProps: any) {
    const data = fieldProps.data?.fields || [];

    const search = {
      box: {
        incremental: true,
      },
      filters: [
        {
          type: 'field_value_selection',
          field: 'type',
          name: 'Type',
          multiSelect: false,
          options: FILTER_OPTIONS.map((i) => ({
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
        render: (value, record) => (
          <EuiText data-test-subj={`${record.name}IntegrationLink`}>
            {_.truncate(record.description, { length: 100 })}
          </EuiText>
        ),
      },
      {
        field: 'type',
        name: 'Type',
        sortable: true,
        truncateText: true,
        render: (value, record) => (
          <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
            {_.truncate(record.type, { length: 100 })}
          </EuiText>
        ),
      },
      {
        field: 'category',
        name: 'Category',
        sortable: true,
        truncateText: true,
        render: (value, record) => (
          <EuiText data-test-subj={`${record.type}IntegrationDescription`}>
            {_.truncate(record.category, { length: 100 })}
          </EuiText>
        ),
      },
    ] as Array<EuiTableFieldDataColumnType<any>>;

    return (
      <EuiPanel>
        <PanelTitle title={'Integration Fields'} />
        <EuiSpacer size="l" />
        <EuiInMemoryTable
          itemId="id"
          loading={false}
          items={data}
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
