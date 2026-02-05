/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { CreateAccelerationForm } from '../../../../../../../../../common/types/data_connections';
import { createAccelerationEmptyDataMock } from '../../../../../../../../../test/accelerations';
import { IndexTypeSelector } from '../index_type_selector';

describe('Index type selector components', () => {
  it('renders type selector with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    render(
      <IndexTypeSelector
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
        initiateColumnLoad={jest.fn()}
        loading={false}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders type selector with different options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'covering',
    };
    const setAccelerationFormData = jest.fn();
    render(
      <IndexTypeSelector
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
        initiateColumnLoad={jest.fn()}
        loading={true}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
