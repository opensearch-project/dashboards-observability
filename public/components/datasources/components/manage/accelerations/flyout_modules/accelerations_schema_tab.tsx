/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBasicTable } from '@elastic/eui';
import React from 'react';

interface AccelerationSchemaTabProps {
  acceleration: any;
}

export const AccelerationSchemaTab = (props: AccelerationSchemaTabProps) => {
  const { acceleration } = props;
  // TODO: Use schema returned from backend
  console.log(acceleration);

  const columns = [
    {
      field: 'columns',
      name: 'Column name',
    },
    {
      field: 'data_type',
      name: 'Data type',
    },
    {
      field: 'acceleration_type',
      name: 'Acceleration index type',
    },
  ];

  return (
    <>
      <EuiBasicTable items={[]} columns={columns} />
    </>
  );
};
