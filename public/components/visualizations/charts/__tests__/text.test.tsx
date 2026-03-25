/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Text } from '../text/text';
import { TEST_VISUALIZATIONS_DATA } from '../../../../../test/event_analytics_constants';

describe('Text component', () => {
  it('Renders text component', async () => {
    render(<Text visualizations={TEST_VISUALIZATIONS_DATA} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
