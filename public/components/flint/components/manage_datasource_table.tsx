/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { AddedIntegrationsTableProps } from '../../integrations/components/added_integration_overview_page';
import {
  ASSET_FILTER_OPTIONS,
  INTEGRATION_TEMPLATE_OPTIONS,
} from '../../../../common/constants/integrations';
import { DeleteModal } from '../../../../public/components/common/helpers/delete_modal';
import { DATASOURCES_BASE, INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { useToast } from '../../../../public/components/common/toast';
import { DatasourcesHeader } from './datasources_header';
import { TabbedPage } from '../../../../public/components/common/tabbed_page/tabbed_page';
import { RouteComponentProps } from 'react-router-dom';
import { HttpStart } from '../../../../../../src/core/public';
import { HomeProps } from '../home';
import { coreRefs } from '../../../framework/core_refs';

export interface ManageDatasourcesTableProps extends HomeProps{
}

export function ManageDatasourcesTable(props: ManageDatasourcesTableProps) {
  const { http, chrome } = props;
  const {pplService} = coreRefs;

  

  const [data, setData] = useState([]);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Datasources',
        href: '#/',
      },
    ]);
    handleDataRequest();
  }, []);

  async function handleDataRequest() {
      pplService!
        .fetch({ query: "show datasources", format: 'jdbc' })
        .then((data) =>
          setData(
            data.jsonData.map((x: any) => {
              return { name: x.DATASOURCE_NAME };
            })
          ));
  }

  const { setToast } = useToast();


  const tableColumns = [
    {
      field: 'name',
      name: 'Asset name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink data-test-subj={`${record.name}IntegrationLink`} href={`#/installed/${record.id}`}>
          {_.truncate(record.name, { length: 100 })}
        </EuiLink>
      ),
    },
    {
      field: 'source',
      name: 'Source',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink
          data-test-subj={`${record.templateName}IntegrationDescription`}
          href={`#/available/${record.templateName}`}
        >
          {_.truncate(record.templateName, { length: 100 })}
        </EuiLink>
      ),
    },
    {
      field: 'dateAdded',
      name: 'Date Added',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.templateName}IntegrationDescription`}>
          {_.truncate(record.creationDate, { length: 100 })}
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
            getModal(record.id, record.templateName);
          }}
        />
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  async function deleteAddedIntegration(integrationInstance: string, name: string) {
    http
      .delete(`${INTEGRATIONS_BASE}/store/${integrationInstance}`)
      .then(() => {
        setToast(`${name} integration successfully deleted!`, 'success');
      })
      .catch((err) => {
        setToast(`Error deleting ${name} or its assets`, 'danger');
      })
      .finally(() => {
        window.location.hash = '#/installed';
      });
  }

  const getModal = (integrationInstanceId, name) => {
    setModalLayout(
      <DeleteModal
        onConfirm={() => {
          setIsModalVisible(false);
          deleteAddedIntegration(integrationInstanceId, name);
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

  const search = {
    box: {
      incremental: true,
    },
    filters: [
      {
        type: 'field_value_selection',
        field: 'templateName',
        name: 'Type',
        multiSelect: false,
        options: [].map((i) => ({
          value: i,
          name: i,
          view: i,
        })),
      },
    ],
  };

  const entries = data.map((integration) => {
    const id = integration.id;
    const templateName = integration.templateName;
    const creationDate = integration.creationDate;
    const name = integration.name;
    return { id, templateName, creationDate, name, data: { templateName, name } };
  });

  return (
    <EuiPage>
      <EuiPageBody component="div">
        {TabbedPage({
          tabNames: [
            ['manage', 'Manage connections'],
            ['new', 'New connection'],
          ],
          header: DatasourcesHeader(),
        })}
        <EuiPageContent data-test-subj="addedIntegrationsArea">
            <EuiInMemoryTable
              loading={props.loading}
              items={entries}
              itemId="id"
              columns={tableColumns}
              tableLayout="auto"
              pagination={{
                initialPageSize: 10,
                pageSizeOptions: [5, 10, 15],
              }}
              search={search}
              allowNeutralSort={false}
              isSelectable={true}
            />
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );
}
