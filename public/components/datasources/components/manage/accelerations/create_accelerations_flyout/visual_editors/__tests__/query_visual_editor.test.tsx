/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { CreateAccelerationForm } from '../../../../../../../../../common/types/data_connections';
import {
  coveringIndexDataMock,
  createAccelerationEmptyDataMock,
  materializedViewValidDataMock,
  skippingIndexDataMock,
} from '../../../../../../../../../test/accelerations';
import { QueryVisualEditor } from '../query_visual_editor';

describe('Visual builder components', () => {
  it('renders visual builder with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    render(
      <QueryVisualEditor
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders visual builder with skipping index options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexName: 'skipping',
      accelerationIndexType: 'skipping',
      skippingIndexQueryData: skippingIndexDataMock,
    };
    const setAccelerationFormData = jest.fn();
    render(
      <QueryVisualEditor
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders visual builder with covering index options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexName: 'cv-idx',
      accelerationIndexType: 'covering',
      coveringIndexQueryData: coveringIndexDataMock,
    };
    const setAccelerationFormData = jest.fn();
    render(
      <QueryVisualEditor
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders visual builder with materialized view options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'materialized',
      materializedViewQueryData: materializedViewValidDataMock,
    };
    const setAccelerationFormData = jest.fn();
    render(
      <QueryVisualEditor
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
