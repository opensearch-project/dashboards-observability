/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { queryWorkbenchPluginCheck } from '../../../../../../../../../common/constants/shared';
import { CreateAccelerationForm } from '../../../../../../../../../common/types/data_connections';
import {
  coveringIndexBuilderMock1,
  createAccelerationEmptyDataMock,
  materializedViewBuilderMock2,
} from '../../../../../../../../../test/accelerations';
import { PreviewSQLDefinition } from '../preview_sql_defintion';

// @ts-ignore
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () =>
      Promise.resolve({
        status: {
          statuses: [{ id: queryWorkbenchPluginCheck }],
        },
      }),
  })
);

describe('Preview SQL acceleration components', () => {
  it('renders Preview SQL settings with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    render(
      <PreviewSQLDefinition
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders Preview SQL settings with default covering index options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...coveringIndexBuilderMock1,
      accelerationIndexType: 'covering',
    };
    const setAccelerationFormData = jest.fn();
    render(
      <PreviewSQLDefinition
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders Preview SQL settings with materialized view options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...materializedViewBuilderMock2,
      accelerationIndexType: 'covering',
    };
    const setAccelerationFormData = jest.fn();
    render(
      <PreviewSQLDefinition
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders Preview SQL settings with error state', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...materializedViewBuilderMock2,
      accelerationIndexType: 'invlalid_state',
    };
    const setAccelerationFormData = jest.fn();
    render(
      <PreviewSQLDefinition
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
