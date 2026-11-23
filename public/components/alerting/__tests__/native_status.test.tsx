/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { BREACH_TAG_COLOR, NativeStatus } from '../native_status';

describe('NativeStatus', () => {
  it("renders a breach as a filled tag in the theme's danger red, with no dot", () => {
    render(<NativeStatus label="In alarm" color="danger" breached data-test-subj="st" />);
    const tag = screen.getByTestId('st');
    expect(tag).toHaveTextContent('In alarm');
    expect(tag).toHaveAttribute('data-breached', 'true');
    expect(tag.className).toMatch(/euiBadge/);
    expect(BREACH_TAG_COLOR).toBe(euiThemeVars.euiColorDanger);
    expect(tag.querySelector('.euiHealth')).toBeNull();
  });

  it('renders any other status as a dot with the word', () => {
    render(<NativeStatus label="Pending" color="warning" breached={false} data-test-subj="st" />);
    const dot = screen.getByTestId('st');
    expect(dot).toHaveTextContent('Pending');
    expect(dot).not.toHaveAttribute('data-breached');
    expect(dot.className).toMatch(/euiHealth/);
  });
});
