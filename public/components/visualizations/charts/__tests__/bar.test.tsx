/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Bar } from '../bar/bar';
import {
  LAYOUT_CONFIG,
  TEST_VISUALIZATIONS_DATA,
} from '../../../../../test/event_analytics_constants';

describe('Veritcal Bar component', () => {
  it('Renders veritcal bar component', async () => {
    render(<Bar visualizations={TEST_VISUALIZATIONS_DATA} layout={LAYOUT_CONFIG} config={true} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
