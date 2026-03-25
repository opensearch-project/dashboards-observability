/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { CreateAccelerationForm } from '../../../../../../../../../common/types/data_connections';
import { createAccelerationEmptyDataMock } from '../../../../../../../../../test/accelerations';
import { DefineIndexOptions } from '../define_index_options';

describe('Index options acceleration components', () => {
  it('renders acceleration index options with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    render(
      <DefineIndexOptions
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders acceleration index options with covering index options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'covering',
      accelerationIndexName: 'covering-idx',
    };
    const setAccelerationFormData = jest.fn();
    render(
      <DefineIndexOptions
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders acceleration index options with materialized index options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'materialized',
      accelerationIndexName: 'mv_metrics',
    };
    const setAccelerationFormData = jest.fn();
    render(
      <DefineIndexOptions
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
