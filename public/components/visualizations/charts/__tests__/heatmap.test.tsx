/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { HeatMap } from '../maps/heatmap';
import {
  LAYOUT_CONFIG,
  TEST_VISUALIZATIONS_DATA,
} from '../../../../../test/event_analytics_constants';

describe('Heatmap component', () => {
  it('Renders heatmap component', async () => {
    render(
      <HeatMap visualizations={TEST_VISUALIZATIONS_DATA} layout={LAYOUT_CONFIG} config={{}} />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
