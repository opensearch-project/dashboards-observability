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
import { AddFieldsModal } from '../add_fields_modal';

describe('Add fields modal in skipping index', () => {
  it('renders add fields modal in skipping index with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    const setIsAddModalVisible = jest.fn();
    render(
      <AddFieldsModal
        setIsAddModalVisible={setIsAddModalVisible}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders add fields modal in skipping index with different options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'skipping',
      skippingIndexQueryData: skippingIndexDataMock,
    };
    const setAccelerationFormData = jest.fn();
    const setIsAddModalVisible = jest.fn();
    render(
      <AddFieldsModal
        setIsAddModalVisible={setIsAddModalVisible}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
