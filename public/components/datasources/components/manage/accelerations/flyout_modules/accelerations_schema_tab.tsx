/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiInMemoryTable, EuiTableFieldDataColumnType } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import React from 'react';

interface AccelerationSchemaTabProps {
  mappings: object;
  indexInfo: object;
}

export const AccelerationSchemaTab = ({ mappings, indexInfo }: AccelerationSchemaTabProps) => {
  const indexName = indexInfo.data[0]?.index;
  const indexData = mappings.data[indexName]?.mappings._meta?.indexedColumns;
  const indexType = mappings.data[indexName]?.mappings._meta?.kind;
  const isSkippingIndex = indexType === 'skipping';

  const items =
    indexData?.map((column: { columnName: string; columnType: string; kind: string }) => ({
      columns_name: column.columnName,
      data_type: column.columnType,
      acceleration_type: column.kind,
    })) || [];

  const columns = [
    {
      field: 'columns_name',
      name: i18n.translate('accelerationSchemaTab.columnNameHeader', {
        defaultMessage: 'Column name',
      }),
    },
    {
      field: 'data_type',
      name: i18n.translate('accelerationSchemaTab.dataTypeHeader', {
        defaultMessage: 'Data type',
      }),
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  if (isSkippingIndex) {
    columns.push({
      field: 'acceleration_type',
      name: i18n.translate('accelerationSchemaTab.accelerationIndexTypeHeader', {
        defaultMessage: 'Acceleration index type',
      }),
    });
  }

  return (
    <>
      <EuiInMemoryTable items={items} columns={columns} />
    </>
  );
};
