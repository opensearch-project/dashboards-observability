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

import React, { useRef, useState } from 'react';
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

  const onEnter = () => {
    const el = ref.current;
    // Only show the tooltip when the text is actually clipped right now.
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const rect = el.getBoundingClientRect();
    setTooltipPos({ top: rect.top - 28, left: rect.left });
  };
  const onLeave = () => setTooltipPos(null);

  return (
    <span className="obsTruncatedLabelWrap" onMouseEnter={onEnter} onMouseLeave={onLeave}>
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
