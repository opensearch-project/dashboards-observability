/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBasicTable,
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSelect,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import producer from 'immer';
import React, { useEffect, useState } from 'react';
import { SKIPPING_INDEX_ACCELERATION_METHODS } from '../../../../../../../../../common/constants/data_sources';
import {
  CreateAccelerationForm,
  SkippingIndexAccMethodType,
  SkippingIndexRowType,
} from '../../../../../../../../../common/types/data_connections';
import { validateSkippingIndexData } from '../../create/utils';
import { AddFieldsModal } from './add_fields_modal';
import { DeleteFieldsModal } from './delete_fields_modal';

interface SkippingIndexBuilderProps {
  accelerationFormData: CreateAccelerationForm;
  setAccelerationFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
}

export const SkippingIndexBuilder = ({
  accelerationFormData,
  setAccelerationFormData,
}: SkippingIndexBuilderProps) => {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalItemCount, setTotalItemCount] = useState(0);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

  let modal;

  if (isAddModalVisible)
    modal = (
      <AddFieldsModal
        setIsAddModalVisible={setIsAddModalVisible}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

  if (isDeleteModalVisible)
    modal = (
      <DeleteFieldsModal
        setIsDeleteModalVisible={setIsDeleteModalVisible}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

  const onTableChange = (page: { index: number; size: number }) => {
    setPageIndex(page.index);
    setPageSize(page.size);
  };

  const onChangeAccelerationMethod = (
    e: React.ChangeEvent<HTMLSelectElement>,
    updateRow: SkippingIndexRowType
  ) => {
    setAccelerationFormData({
      ...accelerationFormData,
      skippingIndexQueryData: accelerationFormData.skippingIndexQueryData.map((row) =>
        row.id === updateRow.id
          ? { ...row, accelerationMethod: e.target.value as SkippingIndexAccMethodType }
          : row
      ),
    });
  };

  const columns = [
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
      name: 'Acceleration method',
      render: (item: SkippingIndexRowType) => (
        <EuiSelect
          id="selectDocExample"
          options={SKIPPING_INDEX_ACCELERATION_METHODS}
          value={item.accelerationMethod}
          onChange={(e) => onChangeAccelerationMethod(e, item)}
          aria-label="Use aria labels when no actual label is in use"
        />
      ),
    },
    {
      name: 'Delete',
      render: (item: SkippingIndexRowType) => {
        return (
          <EuiButtonIcon
            onClick={() => {
              setAccelerationFormData({
                ...accelerationFormData,
                skippingIndexQueryData: accelerationFormData.skippingIndexQueryData.filter(
                  (o) => item.id !== o.id
                ),
              });
            }}
            iconType="trash"
            color="danger"
          />
        );
      },
    },
  ];

  const pagination = {
    pageIndex,
    pageSize,
    totalItemCount,
    pageSizeOptions: [10, 20, 50],
  };

  useEffect(() => {
    if (accelerationFormData.dataTableFields.length > 0) {
      const tableRows: SkippingIndexRowType[] = [
        {
          ...accelerationFormData.dataTableFields[0],
          accelerationMethod: 'PARTITION',
        },
      ];
      setAccelerationFormData(
        producer((accData) => {
          accData.skippingIndexQueryData = tableRows;
          accData.formErrors.skippingIndexError = validateSkippingIndexData(
            accData.accelerationIndexType,
            tableRows
          );
        })
      );
    } else {
      setAccelerationFormData({ ...accelerationFormData, skippingIndexQueryData: [] });
    }
  }, [accelerationFormData.dataTableFields]);

  useEffect(() => {
    setTotalItemCount(accelerationFormData.skippingIndexQueryData.length);
  }, [accelerationFormData.skippingIndexQueryData]);

  return (
    <>
      <EuiText data-test-subj="skipping-index-builder">
        <h3>Skipping index definition</h3>
      </EuiText>
      <EuiSpacer size="s" />
      <EuiBasicTable
        itemID="id"
        items={accelerationFormData.skippingIndexQueryData.slice(
          pageSize * pageIndex,
          pageSize * (pageIndex + 1)
        )}
        columns={columns}
        pagination={pagination}
        onChange={({ page }) => onTableChange(page)}
        hasActions={true}
        error={accelerationFormData.formErrors.skippingIndexError.join('')}
      />
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiButton fill onClick={() => setIsAddModalVisible(true)}>
            Add fields
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton onClick={() => setIsDeleteModalVisible(true)} color="danger">
            Bulk delete
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      {modal}
    </>
  );
};
