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
import React, { useEffect, useState } from 'react';
import { SKIPPING_INDEX_ACCELERATION_METHODS } from '../../../../../../../../../common/constants/data_sources';
import {
  CreateAccelerationForm,
  SkippingIndexAccMethodType,
  SkippingIndexRowType,
} from '../../../../../../../../../common/types/data_connections';
import { AddFieldsModal } from './add_fields_modal';
import { DeleteFieldsModal } from './delete_fields_modal';
import { GenerateFields } from './generate_fields';

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
  const [isSkippingtableLoading, setIsSkippingtableLoading] = useState(false);

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
      readOnly: isSkippingtableLoading,
    },
    {
      field: 'dataType',
      name: 'Datatype',
      sortable: true,
      truncateText: true,
      readOnly: isSkippingtableLoading,
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
      readOnly: isSkippingtableLoading,
    },
    {
      name: 'Delete',
      readOnly: isSkippingtableLoading,
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
        loading={isSkippingtableLoading}
        noItemsMessage={
          isSkippingtableLoading
            ? 'Auto-generating skipping index definition.'
            : 'Please add fields'
        }
      />
      <EuiFlexGroup justifyContent="spaceBetween">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiButton
                onClick={() => setIsAddModalVisible(true)}
                isDisabled={isSkippingtableLoading}
              >
                Add fields
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                onClick={() => setIsDeleteModalVisible(true)}
                isDisabled={isSkippingtableLoading}
                color="danger"
              >
                Bulk delete
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <GenerateFields
            isSkippingtableLoading={isSkippingtableLoading}
            setIsSkippingtableLoading={setIsSkippingtableLoading}
            accelerationFormData={accelerationFormData}
            setAccelerationFormData={setAccelerationFormData}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      {modal}
    </>
  );
};
