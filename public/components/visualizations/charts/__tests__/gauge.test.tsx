/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Gauge } from '../financial/gauge/gauge';
import {
  LAYOUT_CONFIG,
  GAUGE_TEST_VISUALIZATIONS_DATA,
} from '../../../../../test/event_analytics_constants';

describe('Gauge component', () => {
  it('Renders gauge component', async () => {
    render(
      <Gauge visualizations={GAUGE_TEST_VISUALIZATIONS_DATA} layout={LAYOUT_CONFIG} config={true} />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
