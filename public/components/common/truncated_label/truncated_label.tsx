/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single-line label that ellipsis-truncates when it overflows its container,
 * with an instant custom hover tooltip that shows the full text — but only
 * while the text is actually truncated.
 *
 * Truncation is decided at hover time by comparing the span's `scrollWidth`
 * against its `clientWidth`. Measuring on hover (rather than caching the value
 * from a ResizeObserver at mount) keeps the tooltip instant and correct
 * regardless of when the surrounding layout settles — e.g. inside a resizable
 * panel whose width isn't final at first paint.
 *
 * The tooltip is rendered through a portal to `document.body` and positioned
 * `fixed` from the label's viewport rect. The portal matters: a `position:
 * fixed` element is positioned relative to the nearest *transformed* ancestor
 * rather than the viewport, and containers like `EuiResizableContainer` apply
 * transforms — so an in-place tooltip would be mispositioned and clipped by
 * the facet's `overflow`. Rendering into `body` sidesteps every transformed /
 * overflow ancestor. `EuiToolTip` is avoided because it's unreliable when the
 * anchor is nested inside an `EuiCheckbox` `<label>` (the label intercepts and
 * re-dispatches events), and the native `title` attribute has a ~500ms
 * non-configurable delay.
 *
 * The consumer is responsible for bounding the width (e.g. a flex row with
 * `min-width: 0`); this component fills its parent and truncates within it.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './truncated_label.scss';

export interface TruncatedLabelProps {
  text: string;
  /** Label font size in px. Omit to inherit from the surrounding context. */
  fontSize?: number;
  /** Label line height in px. Omit to inherit from the surrounding context. */
  lineHeight?: number;
}

export const TruncatedLabel: React.FC<TruncatedLabelProps> = ({ text, fontSize, lineHeight }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  // Inherit the parent's font metrics unless explicitly overridden, so the
  // label sits identically to the surrounding (e.g. sibling facet) labels.
  const labelStyle: React.CSSProperties = {};
  if (fontSize !== undefined) labelStyle.fontSize = fontSize;
  if (lineHeight !== undefined) labelStyle.lineHeight = `${lineHeight}px`;

  const reveal = useCallback(() => {
    const el = ref.current;
    // Only show the tooltip when the text is actually clipped right now.
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const rect = el.getBoundingClientRect();
    setTooltipPos({ top: rect.top - 28, left: rect.left });
  }, []);
  const hide = useCallback(() => setTooltipPos(null), []);

  // Reveal on keyboard focus too, not just mouse hover (WCAG 1.4.13): when this
  // label sits inside a focusable control (e.g. a collapsible facet-group
  // button, or a checkbox facet-option row), a keyboard-only or screen-magnifier
  // user must be able to read the clipped full text. Focus/blur/keydown land on
  // the focusable CONTROL, not this span, and native focus/blur don't bubble —
  // so wiring the handlers onto the wrap span wouldn't fire. Resolve the real
  // control and attach there:
  //   - nearest focusable ANCESTOR, but only a genuine tab stop. We must EXCLUDE
  //     `tabindex="-1"` wrappers: OUI's `EuiAccordion` gives its content a
  //     `tabIndex=-1` childWrapper and auto-`.focus()`es it on expand, which
  //     would otherwise fire `reveal` on every truncated row at once.
  //   - else the control ASSOCIATED with an enclosing `<label>` (the checkbox
  //     `<input>` is a SIBLING, not an ancestor, of an option-row label).
  // Esc dismisses (WCAG 1.4.13 "dismissable"); the listener lives on the same
  // control so it actually receives the keydown. A plain table cell has no
  // focusable control → no-op (hover still works).
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // Resolve the focusable control once into a `const` so the cleanup closure
    // provably detaches from the same node (no reassignment, no null-narrowing
    // ambiguity): the nearest genuine tab stop, else the enclosing label's
    // associated control.
    const control =
      el.closest('button, a, [role="button"], [tabindex]:not([tabindex="-1"])') ??
      (el.closest('label') as HTMLLabelElement | null)?.control ??
      null;
    if (!control) return undefined;
    // A single focusable control can enclose more than one TruncatedLabel.
    // Focus lands on the shared control (not a specific label), so every
    // label wiring its own `reveal` here would pop all their tooltips at once
    // on focus. Guard so at most one label per control drives the focus reveal
    // (first mounted wins); the rest keep hover-only reveal, which is
    // per-label and unaffected. Today there's ≤1 label per control, so this is
    // defensive against future markup changes.
    if (control.hasAttribute('data-obs-truncated-focus-owner')) return undefined;
    control.setAttribute('data-obs-truncated-focus-owner', 'true');
    const onKeyDown = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') hide();
    };
    control.addEventListener('focus', reveal);
    control.addEventListener('blur', hide);
    control.addEventListener('keydown', onKeyDown);
    return () => {
      control.removeEventListener('focus', reveal);
      control.removeEventListener('blur', hide);
      control.removeEventListener('keydown', onKeyDown);
      control.removeAttribute('data-obs-truncated-focus-owner');
    };
  }, [reveal, hide, text]);

  return (
    <span className="obsTruncatedLabelWrap" onMouseEnter={reveal} onMouseLeave={hide}>
      <span ref={ref} className="obsTruncatedLabel" style={labelStyle}>
        {text}
      </span>
      {tooltipPos &&
        createPortal(
          <span
            className="obsTruncatedLabelTooltip"
            role="tooltip"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
};
