/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Pie } from '../pie/pie';
import {
  LAYOUT_CONFIG,
  TEST_VISUALIZATIONS_DATA,
} from '../../../../../test/event_analytics_constants';

describe('Pie component', () => {
  it('Renders pie component', async () => {
    render(<Pie visualizations={TEST_VISUALIZATIONS_DATA} layout={LAYOUT_CONFIG} config={{}} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
