/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiInMemoryTable,
  EuiLink,
  EuiPageContent,
  EuiPageContentHeaderSection,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import { AvailableIntegrationsTableProps } from './available_integration_overview_page';

export function AvailableIntegrationsTable(props: AvailableIntegrationsTableProps) {
  const integrations = props.data.data;

  const tableColumns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink
          data-test-subj={`${record.templateName}IntegrationLink`}
          href={`#/available/${record.templateName}`}
        >
          {_.truncate(record.templateName, { length: 100 })}
        </EuiLink>
      ),
    },
    {
      field: 'description',
      name: 'Description',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.name}IntegrationDescription`}>
          {_.truncate(record.description, { length: 100 })}
        </EuiText>
      ),
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.name}IntegrationStatus`}>
          {_.truncate(record.status, { length: 100 })}
        </EuiText>
      ),
    },
    {
      field: 'actions',
      name: 'Actions',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink
          data-test-subj={`${record.name}IntegrationAction`}
          // TO DO REPLACE WITH API CALL TO ADD
          onClick={() => props.showModal(record.templateName)}
        >
          Add
        </EuiLink>
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  const FILTER_OPTIONS = ['Visualization', 'Query', 'Metric'];

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

  return (
    <EuiPageContent id="availableIntegrationsArea">
      <EuiPageContentHeaderSection>
        <EuiTitle data-test-subj="applicationHomePageTitle" size="s">
          <h3>Availble Integrations</h3>
        </EuiTitle>
      </EuiPageContentHeaderSection>
      <EuiSpacer />
      {integrations.length > 0 ? (
        <EuiInMemoryTable
          loading={props.loading}
          items={integrations}
          itemId="id"
          columns={tableColumns}
          tableLayout="auto"
          pagination={{
            initialPageSize: 10,
            pageSizeOptions: [5, 10, 15],
          }}
          search={search}
          // sorting={{
          //   sort: {
          //     field: 'dateModified',
          //     direction: 'desc',
          //   },
          // }}
          allowNeutralSort={false}
          isSelectable={true}
          // selection={{
          //   onSelectionChange: (items) => setSelectedApplications(items),
          // }}
        />
      ) : (
        <>
          <EuiSpacer size="xxl" />
          <EuiText textAlign="center">
            <h2>No Integrations Available</h2>
          </EuiText>
          <EuiSpacer size="m" />
        </>
      )}
    </EuiPageContent>
  );
}
