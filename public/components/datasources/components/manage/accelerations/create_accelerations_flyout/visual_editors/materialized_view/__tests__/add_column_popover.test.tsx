/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { CreateAccelerationForm } from '../../../../../../../../../../common/types/data_connections';
import {
  createAccelerationEmptyDataMock,
  materializedViewValidDataMock,
} from '../../../../../../../../../../test/accelerations';
import { AddColumnPopOver } from '../add_column_popover';

describe('Column popover components in materialized view', () => {
  it('renders column popover components in materialized view with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    const setIsColumnPopOverOpen = jest.fn();
    const setColumnExpressionValues = jest.fn();
    render(
      <AddColumnPopOver
        isColumnPopOverOpen={false}
        setIsColumnPopOverOpen={setIsColumnPopOverOpen}
        columnExpressionValues={[]}
        setColumnExpressionValues={setColumnExpressionValues}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders column popover components in materialized view with different options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'materialized',
      materializedViewQueryData: materializedViewValidDataMock,
    };
    const setAccelerationFormData = jest.fn();
    const setIsColumnPopOverOpen = jest.fn();
    const setColumnExpressionValues = jest.fn();
    render(
      <AddColumnPopOver
        isColumnPopOverOpen={false}
        setIsColumnPopOverOpen={setIsColumnPopOverOpen}
        columnExpressionValues={materializedViewValidDataMock.columnsValues}
        setColumnExpressionValues={setColumnExpressionValues}
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
