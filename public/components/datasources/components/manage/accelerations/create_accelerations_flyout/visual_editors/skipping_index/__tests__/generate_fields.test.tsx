/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { createAccelerationEmptyDataMock } from '../../../../../../../../../../test/accelerations';
import { GenerateFields } from '../generate_fields';

describe('Generate fields in skipping index', () => {
  it('Generate fields in skipping index with default options', async () => {
    const accelerationFormData = createAccelerationEmptyDataMock;
    const setAccelerationFormData = jest.fn();
    render(
      <GenerateFields
        accelerationFormData={accelerationFormData}
        setAccelerationFormData={setAccelerationFormData}
        isSkippingtableLoading={false}
        setIsSkippingtableLoading={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
