/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { CreateAccelerationForm } from '../../../../../../../../../../common/types/data_connections';
import { createAccelerationEmptyDataMock } from '../../../../../../../../../../test/accelerations';
import { CoveringIndexBuilder } from '../covering_index_builder';

describe('Covering index builder components', () => {
  it('renders covering index builder with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    render(
      <CoveringIndexBuilder
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders covering index builder  with different options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      coveringIndexQueryData: ['field1', 'field2', 'field3'],
    };
    const setAccelerationFormData = jest.fn();
    render(
      <CoveringIndexBuilder
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
