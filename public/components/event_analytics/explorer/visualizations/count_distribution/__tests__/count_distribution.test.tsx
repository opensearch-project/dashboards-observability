/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { CountDistribution } from '../count_distribution';
import { SAMPLE_VISUALIZATIONS } from '../../../../../../../test/event_analytics_constants';

describe('Count distribution component', () => {
  it('Renders empty count distribution component', async () => {
    render(<CountDistribution />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders count distribution component with data', async () => {
    render(<CountDistribution countDistribution={SAMPLE_VISUALIZATIONS} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
