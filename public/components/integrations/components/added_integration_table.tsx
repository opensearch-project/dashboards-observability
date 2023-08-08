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
  EuiPageContent,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useState } from 'react';
import { AddedIntegrationsTableProps } from './added_integration_overview_page';
import { DeleteModal } from '../../../../public/components/common/helpers/delete_modal';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { useToast } from '../../../../public/components/common/toast';

export function AddedIntegrationsTable(props: AddedIntegrationsTableProps) {
  const { http } = props;

  const { setToast } = useToast();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);

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
        props.setData({
          hits: props.data.hits.filter((i) => i.id !== integrationInstance),
        });
      })
      .catch((err) => {
        setToast(`Error deleting ${name} or its assets`, 'danger');
      })
      .finally(() => {
        window.location.hash = '#/installed';
      });
  }

  const getModal = (integrationInstanceId: string, name: string) => {
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

  const integTemplateNames = [...new Set(props.data.hits.map((i) => i.templateName))].sort();

  const search = {
    box: {
      incremental: true,
    },
    filters: [
      {
        type: 'field_value_selection' as const,
        field: 'templateName',
        name: 'Type',
        multiSelect: false,
        options: integTemplateNames.map((name) => ({
          name,
          value: name,
          view: name,
        })),
      },
    ],
  };

  const entries = props.data.hits.map((integration) => {
    const id = integration.id;
    const templateName = integration.templateName;
    const creationDate = integration.creationDate;
    const name = integration.name;
    return { id, templateName, creationDate, name, data: { templateName, name } };
  });

  return (
    <EuiPageContent data-test-subj="addedIntegrationsArea">
      {entries && entries.length > 0 ? (
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
      ) : (
        <>
          <EuiFlexGroup direction="column" alignItems="center">
            <EuiFlexItem grow={true}>
              <EuiIcon size="xxl" type="help" />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer />
          <EuiText textAlign="center" data-test-subj="no-added-integrations">
            <h2>
              There are currently no added integrations. Add them{' '}
              <EuiLink href={'#/available'}>here</EuiLink> to start using pre-canned assets!
            </h2>
          </EuiText>
          <EuiSpacer size="m" />
        </>
      )}
      {isModalVisible && modalLayout}
    </EuiPageContent>
  );
}
