/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonGroup,
  EuiInMemoryTable,
  EuiLink,
  EuiPageContent,
  EuiPageContentHeaderSection,
  EuiSpacer,
  EuiSwitch,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useState } from 'react';
import { AvailableIntegrationsTableProps } from './available_integration_overview_page';
import { badges } from './integration_category_badge_group';

export function AvailableIntegrationsTable(props: AvailableIntegrationsTableProps) {
  const integrations = props.data.hits;

  const toggleButtonsIcons = [
    {
      id: '0',
      label: 'list',
      iconType: 'list',
    },
    {
      id: '1',
      label: 'grid',
      iconType: 'grid',
    },
  ];

  const [toggleIconIdSelected, setToggleIconIdSelectedc] = useState('0');

  const onChangeIcons = (optionId) => {
    setToggleIconIdSelectedc(optionId);
    if (optionId === '0') {
      props.setCardView(false);
    } else {
      props.setCardView(true);
    }
  };

  const tableColumns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink
          data-test-subj={`${record.name}IntegrationLink`}
          href={`#/available/${record.name}`}
        >
          {_.truncate(record.displayName || record.name, { length: 100 })}
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
      field: 'categories',
      name: 'Categories',
      sortable: true,
      truncateText: true,
      render: (value, record) => badges(record.components),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  const FILTER_OPTIONS = ['Visualization', 'Query', 'Metric'];

  const renderToggle = () => {
    return (
      <EuiButtonGroup
        legend="Text align"
        options={toggleButtonsIcons}
        idSelected={toggleIconIdSelected}
        onChange={(id) => onChangeIcons(id)}
        isIconOnly
      />
    );
  };

  const search = {
    toolsRight: renderToggle(),
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
