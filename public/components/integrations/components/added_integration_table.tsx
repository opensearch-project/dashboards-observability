/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiEmptyPrompt,
  EuiInMemoryTable,
  EuiLink,
  EuiOverlayMask,
  EuiPageContent,
  EuiTableFieldDataColumnType,
  EuiText,
} from '@elastic/eui';
import truncate from 'lodash/truncate';
import React, { useState } from 'react';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { DeleteModal } from '../../../../public/components/common/helpers/delete_modal';
import { useToast } from '../../../../public/components/common/toast';
import {
  AddedIntegrationType,
  AddedIntegrationsTableProps,
} from './added_integration_overview_page';

export function AddedIntegrationsTable(props: AddedIntegrationsTableProps) {
  const { http, dataSourceEnabled } = props;
  const { setToast } = useToast();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);
  const [selectedIntegrations, setSelectedIntegrations] = useState<any[]>([]);

  const tableColumns = [
    {
      field: 'name',
      name: 'Integration Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiLink data-test-subj={`${record.name}IntegrationLink`} href={`#/installed/${record.id}`}>
          {truncate(record.name, { length: 100 })}
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
          {truncate(record.templateName, { length: 100 })}
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
          {truncate(record.creationDate, { length: 100 })}
        </EuiText>
      ),
    },
  ] as Array<EuiTableFieldDataColumnType<AddedIntegrationType>>;

  if (dataSourceEnabled) {
    tableColumns.splice(1, 0, {
      field: 'dataSourceName',
      name: 'Data Source Name',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText data-test-subj={`${record.templateName}IntegrationDescription`}>
          {truncate(record.dataSourceMDSLabel || 'Local cluster', { length: 100 })}
        </EuiText>
      ),
    });
  }

  async function deleteAddedIntegrations(selectedItems: any[]) {
    const deletePromises = selectedItems.map(async (item) => {
      try {
        await http.delete(`${INTEGRATIONS_BASE}/store/${item.id}`);
        setToast(`${item.name} integration successfully deleted!`, 'success');
      } catch (error) {
        setToast(`Error deleting ${item.name} or its assets`, 'danger');
      }
    });

    Promise.all(deletePromises);

    props.setData({
      hits: props.data.hits.filter(
        (item) => !selectedItems.some((selected) => selected.id === item.id)
      ),
    });

    window.location.hash = '#/installed';
  }

  const activateDeleteModal = () => {
    const integrationNames = selectedIntegrations.map((item) => item.name).join(', ');
    setModalLayout(
      <DeleteModal
        onConfirm={async () => {
          setIsModalVisible(false);
          await deleteAddedIntegrations(selectedIntegrations);
        }}
        onCancel={() => setIsModalVisible(false)}
        title={`Delete Integrations`}
        message={`Are you sure you want to delete the selected integrations: ${integrationNames}?`}
      />
    );
    setIsModalVisible(true);
  };
  const integTemplateNames = [...new Set(props.data.hits.map((i) => i.templateName))].sort();
  let mdsLabels;
  if (dataSourceEnabled) {
    mdsLabels = [
      ...new Set(
        props.data.hits.flatMap((hit) =>
          hit.references?.length > 0 ? hit.references.map((ref) => ref.name || 'Local cluster') : []
        )
      ),
    ].sort();
  }

  const search = {
    toolsLeft: selectedIntegrations.length > 0 && (
      <EuiButton
        color="danger"
        iconType="trash"
        onClick={activateDeleteModal}
        data-test-subj="deleteSelectedIntegrations"
      >
        Delete {selectedIntegrations.length} integration
        {selectedIntegrations.length > 1 ? 's' : ''}
      </EuiButton>
    ),
    box: {
      incremental: true,
      compressed: true,
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
      ...(dataSourceEnabled
        ? [
            {
              type: 'field_value_selection' as const,
              field: 'dataSourceMDSLabel',
              name: 'Data Source Name',
              multiSelect: false,
              options: mdsLabels?.map((name) => ({
                name,
                value: name,
                view: name,
              })),
            },
          ]
        : []),
    ].map((filter) => ({
      ...filter,
      compressed: true,
    })),
  };

  const entries = props.data.hits.map((integration) => {
    const id = integration.id;
    const templateName = integration.templateName;
    const creationDate = integration.creationDate;
    const name = integration.name;
    const dataSourceMDSLabel = integration.references
      ? integration.references[0].name
      : 'Local cluster';
    return {
      id,
      templateName,
      creationDate,
      name,
      data: { templateName, name },
      dataSourceMDSLabel,
    };
  });

  return (
    <EuiPageContent data-test-subj="addedIntegrationsArea" paddingSize="m">
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
          selection={{
            onSelectionChange: (items) => setSelectedIntegrations(items),
          }}
        />
      ) : (
        <EuiEmptyPrompt
          iconType="minusInCircle"
          title={<h2>No installed integrations</h2>}
          body={
            <p>
              There are currently no added integrations in this table. Add integrations from the{' '}
              <EuiLink href={'#/available'}>available list</EuiLink>.
            </p>
          }
        />
      )}
      {isModalVisible && modalLayout}
    </EuiPageContent>
  );
}
