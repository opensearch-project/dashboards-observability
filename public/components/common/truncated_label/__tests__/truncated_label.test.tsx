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

  // jsdom has no layout, so force the "clipped" condition the component checks
  // (scrollWidth > clientWidth) on the inner label span.
  const forceTruncated = (text: string) => {
    const span = screen.getByText(text);
    Object.defineProperty(span, 'scrollWidth', { configurable: true, value: 200 });
    Object.defineProperty(span, 'clientWidth', { configurable: true, value: 50 });
  };

  it('reveals on keyboard focus of a focusable ANCESTOR (facet-group key button) and Esc dismisses', () => {
    const LONG = 'deployment_environment';
    render(
      <button type="button">
        <TruncatedLabel text={LONG} />
      </button>
    );
    forceTruncated(LONG);
    const btn = screen.getByRole('button');
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent(LONG);
    // WCAG 1.4.13 dismissable — Esc on the focused control hides it.
    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    // blur also hides.
    fireEvent.focus(btn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(btn);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does NOT reveal when the only ancestor is a tabindex="-1" wrapper (EuiAccordion childWrapper)', () => {
    const LONG = 'deployment_environment';
    render(
      <div tabIndex={-1} data-test-subj="wrapper">
        <TruncatedLabel text={LONG} />
      </div>
    );
    forceTruncated(LONG);
    fireEvent.focus(screen.getByTestId('wrapper'));
    // Regression guard: focusing the auto-focused accordion wrapper must not
    // pop the tooltip (it previously fired on every truncated row at once).
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('reveals via the associated control of an enclosing label (checkbox option row)', () => {
    const LONG = 'ObservabilityStack_Prometheus';
    render(
      <div>
        <input id="cb" type="checkbox" />
        <label htmlFor="cb">
          <TruncatedLabel text={LONG} />
        </label>
      </div>
    );
    forceTruncated(LONG);
    const input = document.getElementById('cb') as HTMLInputElement;
    fireEvent.focus(input);
    expect(screen.getByRole('tooltip')).toHaveTextContent(LONG);
    fireEvent.blur(input);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
