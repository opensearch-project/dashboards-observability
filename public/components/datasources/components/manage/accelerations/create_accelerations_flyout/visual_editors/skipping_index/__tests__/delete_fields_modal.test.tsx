/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { CreateAccelerationForm } from '../../../../../../../../../../common/types/data_connections';
import {
  createAccelerationEmptyDataMock,
  skippingIndexDataMock,
} from '../../../../../../../../../../test/accelerations';
import { DeleteFieldsModal } from '../delete_fields_modal';

describe('Delete fields modal in skipping index', () => {
  it('renders delete fields modal in skipping index with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    const setIsDeleteModalVisible = jest.fn();
    render(
      <DeleteFieldsModal
        setIsDeleteModalVisible={setIsDeleteModalVisible}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders delete fields modal in skipping index with different options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'skipping',
      skippingIndexQueryData: skippingIndexDataMock,
    };
    const setAccelerationFormData = jest.fn();
    const setIsDeleteModalVisible = jest.fn();
    render(
      <DeleteFieldsModal
        setIsDeleteModalVisible={setIsDeleteModalVisible}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
