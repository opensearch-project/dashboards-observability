/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiIcon,
  EuiInMemoryTable,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
} from '@elastic/eui';
import _ from 'lodash';

interface AccelrationIndicesRecordType {
  indexName: string;
  accelerationType: string;
}

export const ManagementTable = () => {
  const [accelrationIndicesRecords, setAccelrationIndicesRecords] = useState<
    AccelrationIndicesRecordType[]
  >([]);

  useEffect(() => {
    setAccelrationIndicesRecords([
      {
        indexName: 'Sample-skipping-index',
        accelerationType: 'Skipping Index',
      },
      {
        indexName: 'Sample-covering-index',
        accelerationType: 'covering Index',
      },
      {
        indexName: 'Sample-materialized-view',
        accelerationType: 'Materialized View',
      },
    ]);
  }, []);

  const tableColumns = [
    {
      field: 'indexName',
      name: 'Index Name',
      sortable: true,
      truncateText: true,
      render: (value, record: AccelrationIndicesRecordType) => (
        <EuiText>{_.truncate(record.indexName, { length: 100 })}</EuiText>
      ),
    },
    {
      field: 'accelerationType',
      name: 'Acceleration type',
      sortable: true,
      truncateText: true,
      render: (value, record) => (
        <EuiText>{_.truncate(record.accelerationType, { length: 100 })}</EuiText>
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
        field: 'accelerationType',
        name: 'Type',
        multiSelect: 'or',
        options: accelrationIndicesRecords.map((AccelerationIndexRecord) => ({
          value: AccelerationIndexRecord.accelerationType,
          name: AccelerationIndexRecord.accelerationType,
          view: AccelerationIndexRecord.accelerationType,
        })),
      },
    ],
  };

  return (
    <>
      <EuiSpacer size="s" />
      <EuiInMemoryTable
        items={accelrationIndicesRecords}
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
    </>
  );
};
