/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { materializedViewBuilderMock2 } from '../../../../../../../../../test/accelerations';
import { CreateAccelerationButton } from '../create_acceleration_button';

describe('Create acceleration button component', () => {
  it('renders create acceleration button component with mv state', async () => {
    const accelerationFormData = materializedViewBuilderMock2;
    const setAccelerationFormData = jest.fn();
    render(
      <CreateAccelerationButton
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
        resetFlyout={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
