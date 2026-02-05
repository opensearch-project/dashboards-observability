/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { ServiceMapScale } from '../service_map_scale';

describe('Service map scale component', () => {
  it('renders service map scale', async () => {
    render(
      <ServiceMapScale
        idSelected="latency"
        serviceMap={undefined}
        ticks={[0, 50, 100, 150, 200, 250]}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
