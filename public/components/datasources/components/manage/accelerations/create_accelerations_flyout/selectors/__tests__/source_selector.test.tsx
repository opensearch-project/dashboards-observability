/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { coreMock } from '../../../../../../../../../../../src/core/public/mocks';
import { CreateAccelerationForm } from '../../../../../../../../../common/types/data_connections';
import {
  createAccelerationEmptyDataMock,
  mockDatasourcesQuery,
} from '../../../../../../../../../test/accelerations';
import { AccelerationDataSourceSelector } from '../source_selector';

const coreStartMock = coreMock.createStart();

describe('Source selector components', () => {
  it('renders source selector with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const selectedDatasource = 'my_glue';
    const setAccelerationFormData = jest.fn();
    const client = coreStartMock.http;
    client.get = jest.fn().mockResolvedValue(mockDatasourcesQuery);

    render(
      <AccelerationDataSourceSelector
        http={client}
        selectedDatasource={selectedDatasource}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
        dataSourcesPreselected={false}
        tableFieldsLoading={false}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders source selector with different options', async () => {
    const selectedDatasource = 'ds';
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      dataSource: 'ds',
      database: 'db',
      dataTable: 'tb',
    };
    const setAccelerationFormData = jest.fn();
    const client = coreStartMock.http;
    client.get = jest.fn().mockResolvedValue(mockDatasourcesQuery);
    client.post = jest.fn().mockResolvedValue([]);
    render(
      <AccelerationDataSourceSelector
        selectedDatasource={selectedDatasource}
        http={client}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
        dataSourcesPreselected={true}
        tableFieldsLoading={false}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
