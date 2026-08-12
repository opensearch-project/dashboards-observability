/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { TruncatedLabel } from '../truncated_label';

describe('TruncatedLabel', () => {
  it('renders the label text', () => {
    render(<TruncatedLabel text="ObservabilityStack_Prometheus" />);
    expect(screen.getByText('ObservabilityStack_Prometheus')).toBeInTheDocument();
  });

  it('does not surface the hover tooltip when the text is not truncated', () => {
    // jsdom reports scrollWidth === clientWidth (0), so the label is considered
    // untruncated; hovering must not render the fixed tooltip. (The positive,
    // truncated case depends on a real ResizeObserver + layout, unavailable in
    // jsdom.)
    render(<TruncatedLabel text="short" />);
    fireEvent.mouseEnter(screen.getByText('short'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
