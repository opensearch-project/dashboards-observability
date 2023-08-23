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
import { RouteComponentProps } from 'react-router-dom';
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
import { HttpStart } from '../../../../../../src/core/public';
import { HomeProps } from '../home';
import { coreRefs } from '../../../framework/core_refs';
import { DatasourcesDescription } from './manage_datasource_description';

export type ManageDatasourcesTableProps = HomeProps;

export function ManageDatasourcesTable(props: ManageDatasourcesTableProps) {
  const { http, chrome } = props;
  const { pplService } = coreRefs;

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
    pplService!.fetch({ query: 'show datasources', format: 'jdbc' }).then((datasources) =>
      setData(
        datasources.jsonData.map((x: any) => {
          return { name: x.DATASOURCE_NAME, connectionType: x.CONNECTOR_TYPE };
        })
      )
    );
  }

  const { setToast } = useToast();

  const tableColumns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink
          data-test-subj={`${record.name}DatasourceLink`}
          href={`#/accelerate/${record.name}`}
        >
          {_.truncate(record.name, { length: 100 })}
        </EuiLink>
      ),
    },
    {
      field: 'connectionType',
      name: 'Connection type',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.templateName}DatasourceType`}>
          {_.truncate(record.connectionType, { length: 100 })}
        </EuiText>
      ),
    },
    {
      field: 'connectedTo',
      name: 'Connected to',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.templateName}DatasourceConnectedTo`}>
          {_.truncate(record.creationDate, { length: 100 })}
        </EuiText>
      ),
    },
    {
      field: 'connectionHealth',
      name: 'Connection Health',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.templateName}DatasourceConnectionHealth`}>
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
            /* Delete Datasource*/
          }}
        />
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

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

  const entries = data.map((datasource) => {
    const name = datasource.name;
    const connectionType = datasource.connectionType;
    return { connectionType, name, data: { name, connectionType } };
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
          <DatasourcesDescription />
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
