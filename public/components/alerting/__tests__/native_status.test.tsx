/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { BREACH_DOT_COLOR, NativeStatus } from '../native_status';

describe('NativeStatus', () => {
  it("renders a breach as the theme's danger-red dot with the word in bold", () => {
    render(<NativeStatus label="In alarm" color="subdued" breached data-test-subj="st" />);
    const st = screen.getByTestId('st');
    expect(st).toHaveTextContent('In alarm');
    expect(st).toHaveAttribute('data-breached', 'true');
    expect(screen.getByText('In alarm')).toHaveStyle({ fontWeight: 600 });
    expect(st.className).toMatch(/euiHealth/);
    expect(st.className).not.toMatch(/euiBadge/);
    expect(BREACH_DOT_COLOR).toBe(euiThemeVars.euiColorDanger);
  });

  it('renders any other status as a dot with the word, also in bold', () => {
    render(<NativeStatus label="Pending" color="warning" breached={false} data-test-subj="st" />);
    const dot = screen.getByTestId('st');
    expect(dot).toHaveTextContent('Pending');
    expect(dot).not.toHaveAttribute('data-breached');
    expect(dot.className).toMatch(/euiHealth/);
    expect(screen.getByText('Pending')).toHaveStyle({ fontWeight: 600 });
  });

  it('keeps a non-breach word bold alongside a caller style and hover text', () => {
    render(
      <NativeStatus
        label="OK"
        color="success"
        breached={false}
        title="OK"
        labelStyle={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
        data-test-subj="st"
      />
    );
    const word = screen.getByText('OK');
    expect(word).toHaveStyle({ fontWeight: 600, whiteSpace: 'nowrap' });
    expect(word).toHaveAttribute('title', 'OK');
    expect(screen.getByTestId('st')).not.toHaveAttribute('data-breached');
  });
});
