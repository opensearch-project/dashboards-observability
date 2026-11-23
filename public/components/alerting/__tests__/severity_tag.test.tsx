/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SeverityTag } from '../severity_tag';

describe('SeverityTag', () => {
  it.each(['critical', 'high', 'medium', 'low', 'info'])(
    'renders %s as an outlined neutral tag',
    (sev) => {
      render(<SeverityTag severity={sev} data-test-subj="sev" />);
      const tag = screen.getByTestId('sev');
      expect(tag.className).toMatch(/euiBadge--hollow/);
      expect(tag.getAttribute('style') || '').not.toMatch(/background-color/);
    }
  );

  it('renders Critical with its word and no fill (color belongs to the status)', () => {
    render(<SeverityTag severity="critical" data-test-subj="sev" />);
    const tag = screen.getByTestId('sev');
    expect(tag).toHaveTextContent('Critical');
    expect(tag.className).toMatch(/euiBadge--hollow/);
    expect(tag.getAttribute('style') || '').not.toMatch(/background-color/);
  });

  it('shows the placeholder for an absent severity', () => {
    render(<SeverityTag severity={undefined} data-test-subj="sev" />);
    expect(screen.getByTestId('sev')).toHaveTextContent('—');
  });
});
