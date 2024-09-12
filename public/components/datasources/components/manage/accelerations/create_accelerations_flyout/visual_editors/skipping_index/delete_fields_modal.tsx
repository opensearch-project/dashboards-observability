/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButton,
  EuiInMemoryTable,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiTableFieldDataColumnType,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useState } from 'react';
import {
  CreateAccelerationForm,
  SkippingIndexRowType,
} from '../../../../../../../../../common/types/data_connections';

interface AddFieldsModalProps {
  setIsDeleteModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  accelerationFormData: CreateAccelerationForm;
  setAccelerationFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
}

export const DeleteFieldsModal = ({
  setIsDeleteModalVisible,
  accelerationFormData,
  setAccelerationFormData,
}: AddFieldsModalProps) => {
  const [selectedFields, setSelectedFields] = useState<SkippingIndexRowType[]>([]);

  const tableColumns: Array<EuiTableFieldDataColumnType<SkippingIndexRowType>> = [
    {
      field: 'fieldName',
      name: 'Field name',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'dataType',
      name: 'Datatype',
      sortable: true,
      truncateText: true,
    },
    {
      field: 'accelerationMethod',
      name: 'Acceleration method',
      sortable: true,
      truncateText: true,
    },
  ];

  const pagination = {
    initialPageSize: 20,
    pageSizeOptions: [10, 20, 50],
  };

  return (
    <EuiModal onClose={() => setIsDeleteModalVisible(false)}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>Bulk delete</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        <EuiInMemoryTable
          items={accelerationFormData.skippingIndexQueryData}
          itemId="id"
          columns={tableColumns}
          search={true}
          pagination={pagination}
          sorting={true}
          isSelectable={true}
          selection={{
            onSelectionChange: (items) => setSelectedFields(items),
          }}
        />
      </EuiModalBody>

      <EuiModalFooter>
        <EuiSmallButton onClick={() => setIsDeleteModalVisible(false)}>Cancel</EuiSmallButton>
        <EuiSmallButton
          onClick={() => {
            setAccelerationFormData({
              ...accelerationFormData,
              skippingIndexQueryData: _.differenceBy(
                accelerationFormData.skippingIndexQueryData,
                selectedFields,
                'id'
              ),
            });
            setIsDeleteModalVisible(false);
          }}
          color="danger"
          fill
        >
          Delete
        </EuiSmallButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
