/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { HitsCounter } from '../hits_counter';

describe('Hits counter component', () => {
  it('Renders hits counter', async () => {
    const onResetQuery = jest.fn();

    render(<HitsCounter hits={815} showResetButton={false} onResetQuery={onResetQuery} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
