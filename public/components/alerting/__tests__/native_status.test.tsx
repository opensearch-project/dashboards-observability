/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { BREACH_DOT_COLOR, NativeStatus } from '../native_status';

describe('NativeStatus', () => {
  it("renders a breach as the theme's danger-red dot with the word", () => {
    render(<NativeStatus label="In alarm" color="subdued" breached data-test-subj="st" />);
    const st = screen.getByTestId('st');
    expect(st).toHaveTextContent('In alarm');
    expect(st).toHaveAttribute('data-breached', 'true');
    expect(st.className).toMatch(/euiHealth/);
    expect(st.className).not.toMatch(/euiBadge/);
    expect(BREACH_DOT_COLOR).toBe(euiThemeVars.euiColorDanger);
  });

  it('renders any other status as a dot with the word', () => {
    render(<NativeStatus label="Pending" color="warning" breached={false} data-test-subj="st" />);
    const dot = screen.getByTestId('st');
    expect(dot).toHaveTextContent('Pending');
    expect(dot).not.toHaveAttribute('data-breached');
    expect(dot.className).toMatch(/euiHealth/);
  });
});
