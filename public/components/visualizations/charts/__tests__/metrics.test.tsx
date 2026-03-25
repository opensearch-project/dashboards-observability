/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Metrics } from '../metrics/metrics';
import {
  LAYOUT_CONFIG,
  METRICS_TEST_VISUALIZATIONS_DATA,
} from '../../../../../test/event_analytics_constants';

describe('Metrics component', () => {
  it('Renders Metrics component', async () => {
    render(
      <Metrics
        visualizations={METRICS_TEST_VISUALIZATIONS_DATA}
        layout={LAYOUT_CONFIG}
        config={true}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
