/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import { AvailableIntegrationsCardView } from '../available_integration_card_view';
import { availableCardViewData } from './testing_constants';
import React from 'react';

describe('Available Integration Card View Test', () => {
  it('Renders nginx integration card view using dummy data', async () => {
    render(<AvailableIntegrationsCardView {...availableCardViewData} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
