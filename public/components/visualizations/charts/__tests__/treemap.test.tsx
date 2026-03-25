/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { TreeMap } from '../maps/treemaps';
import {
  LAYOUT_CONFIG,
  TEST_VISUALIZATIONS_DATA,
} from '../../../../../test/event_analytics_constants';

describe('Treemap component', () => {
  it('Renders treemap component', async () => {
    render(
      <TreeMap visualizations={TEST_VISUALIZATIONS_DATA} layout={LAYOUT_CONFIG} config={{}} />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
