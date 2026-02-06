/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { coreMock } from '../../../../../../../../../../../src/core/public/mocks';
import { queryWorkbenchPluginCheck } from '../../../../../../../../../common/constants/shared';
import { mockDatasourcesQuery } from '../../../../../../../../../test/accelerations';
import { CreateAcceleration } from '../create_acceleration';

const coreStartMock = coreMock.createStart();

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

describe('Create acceleration flyout components', () => {
  it('renders acceleration flyout component with default options', async () => {
    const selectedDatasource = 'my_glue';
    const resetFlyout = jest.fn();
    coreStartMock.http.get = jest.fn().mockResolvedValue(mockDatasourcesQuery);

    render(
      <CreateAcceleration selectedDatasource={selectedDatasource} resetFlyout={resetFlyout} />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
