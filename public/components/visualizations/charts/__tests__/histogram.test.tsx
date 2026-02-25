/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Histogram } from '../histogram/histogram';
import {
  LAYOUT_CONFIG,
  TEST_VISUALIZATIONS_DATA,
} from '../../../../../test/event_analytics_constants';

describe('Histogram component', () => {
  it('Renders histogram component', async () => {
    render(
      <Histogram visualizations={TEST_VISUALIZATIONS_DATA} layout={LAYOUT_CONFIG} config={true} />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
