/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { FlyoutListItem } from '../flyout_list_item';

describe('<FlyoutListItem /> spec', () => {
  it('renders the component', async () => {
    const addSpanFilter = jest.fn();
    render(
      <FlyoutListItem title="Span ID" description="test-span-id" addSpanFilter={addSpanFilter} />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
