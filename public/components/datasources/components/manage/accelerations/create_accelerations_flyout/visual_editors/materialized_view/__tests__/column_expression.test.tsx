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
import { ColumnExpression } from '../column_expression';

describe('Column expression components in materialized view', () => {
  it('renders column expression components in materialized view with default options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'materialized',
      materializedViewQueryData: materializedViewValidDataMock,
    };
    const setAccelerationFormData = jest.fn();
    const setColumnExpressionValues = jest.fn();
    render(
      <ColumnExpression
        index={0}
        currentColumnExpressionValue={materializedViewValidDataMock.columnsValues[0]}
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

  it('renders column expression components in materialized view with different options', async () => {
    const accelerationFormData: CreateAccelerationForm = {
      ...createAccelerationEmptyDataMock,
      accelerationIndexType: 'materialized',
      materializedViewQueryData: materializedViewValidDataMock,
    };
    const setAccelerationFormData = jest.fn();
    const setColumnExpressionValues = jest.fn();
    render(
      <ColumnExpression
        index={1}
        currentColumnExpressionValue={materializedViewValidDataMock.columnsValues[1]}
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
