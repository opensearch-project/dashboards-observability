/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { CRITICAL_TAG_COLOR, SeverityTag } from '../severity_tag';

describe('SeverityTag', () => {
  it.each(['high', 'medium', 'low', 'info'])('renders %s as an outlined neutral tag', (sev) => {
    render(<SeverityTag severity={sev} data-test-subj="sev" />);
    const tag = screen.getByTestId('sev');
    expect(tag.className).toMatch(/euiBadge--hollow/);
    expect(tag.getAttribute('style') || '').not.toMatch(/background-color/);
  });

  it('renders Critical as a dark filled tag, with no red', () => {
    render(<SeverityTag severity="critical" data-test-subj="sev" />);
    const tag = screen.getByTestId('sev');
    expect(tag).toHaveTextContent('Critical');
    expect(tag.className).not.toMatch(/euiBadge--hollow/);
    expect(CRITICAL_TAG_COLOR).toBe(euiThemeVars.euiColorDarkestShade);
    expect(CRITICAL_TAG_COLOR).not.toBe(euiThemeVars.euiColorDanger);
    expect(tag).toHaveStyle({ backgroundColor: CRITICAL_TAG_COLOR });
  });

  it('shows the placeholder for an absent severity', () => {
    render(<SeverityTag severity={undefined} data-test-subj="sev" />);
    expect(screen.getByTestId('sev')).toHaveTextContent('—');
  });
});
