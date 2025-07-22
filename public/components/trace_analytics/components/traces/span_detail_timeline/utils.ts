/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScaleLinear } from 'd3-scale';
import round from 'lodash/round';
import sortBy from 'lodash/sortBy';
import { TraceAnalyticsMode } from '../../../../../../common/types/trace_analytics';
import { microToMilliSec, nanoToMilliSec, parseIsoToNano } from '../../common/helper_functions';
import { Span } from '../../common/constants';
import { SpanWithChildren, JaegerSpan, SpanMap, SpanReference } from './types';

export const DEFAULT_DOMAIN: [number, number] = [0, 100];
export const MINIMAP_HEIGHT = 42;
export const RULER_HEIGHT = 28;
export const SPAN_ROW_INDENTATION_IN_PIXELS = 12;

export const isDefaultDomain = (domain: [number, number]) =>
  domain[0] === DEFAULT_DOMAIN[0] && domain[1] === DEFAULT_DOMAIN[1];

export const drawSpansOnCanvas = (
  canvas: HTMLCanvasElement,
  spans: SpanWithChildren[],
  mode: TraceAnalyticsMode,
  min: number,
  scale: ScaleLinear<number, number>,
  colorMap: Record<string, string>,
  layoutMetrics: { spanBarHeight: number; verticalOffset: number }
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas size to match container
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, rect.width, rect.height);

  const { spanBarHeight, verticalOffset } = layoutMetrics;

  // Draw spans recursively
  const drawSpanGroup = (spanList: SpanWithChildren[], rowOffset: number = 0): number => {
    let currentRow = rowOffset;

    spanList.forEach((span) => {
      const startTime = getStartTimeInMs(mode, span) - min;
      const duration = getDurationInMs(mode, span);
      const start = scale(startTime);
      const width = scale(duration);

      // Calculate pixel positions with 6px horizontal padding (minimap left/right handles)
      const availableWidth = rect.width - 12; // 6px left + 6px right padding
      const x = (start / 100) * availableWidth + 6; // 6px left padding
      const y = currentRow * spanBarHeight + verticalOffset; // Draw at current row
      const w = Math.max(1, (width / 100) * availableWidth);
      const h = spanBarHeight;

      // Only draw if within bounds
      if (y + h <= rect.height) {
        // Set color and draw rectangle
        ctx.fillStyle = colorMap[span.serviceName] || '#ccc';
        ctx.fillRect(x, y, w, h);
      }

      // Move to the next row (this span occupies currentRow, so next available is currentRow + 1)
      currentRow++;

      // Draw children recursively if they exist (minimap always shows all spans expanded)
      if (span.children.length > 0) {
        currentRow = drawSpanGroup(
          sortBy(span.children, (child) => getStartTimeInMs(mode, child)),
          currentRow
        );
      }
    });

    return currentRow;
  };

  drawSpanGroup(spans);
};

export const addRootSpan = (
  spanId: string,
  spanMap: SpanMap,
  rootSpans: SpanWithChildren[],
  alreadyAddedRootSpans: Set<string>
) => {
  if (!alreadyAddedRootSpans.has(spanId)) {
    rootSpans.push(spanMap[spanId]);
    alreadyAddedRootSpans.add(spanId);
  }
};

export const buildHierarchy = (mode: TraceAnalyticsMode, spans: Span[]): SpanWithChildren[] => {
  const spanMap: SpanMap = {};

  spans.forEach((span) => {
    const spanId = mode === 'jaeger' ? ((span as unknown) as JaegerSpan).spanID : span.spanId;
    spanMap[spanId] = { ...span, spanId, children: [] } as SpanWithChildren;
  });

  const rootSpans: SpanWithChildren[] = [];
  const alreadyAddedRootSpans: Set<string> = new Set(); // Track added root spans

  spans.forEach((span) => {
    const spanId = mode === 'jaeger' ? ((span as unknown) as JaegerSpan).spanID : span.spanId;
    const references = ((span as unknown) as JaegerSpan).references || [];

    if (mode === 'jaeger') {
      references.forEach((ref: SpanReference) => {
        if (ref.refType === 'CHILD_OF') {
          const parentSpan = spanMap[ref.spanID];
          if (parentSpan) {
            parentSpan.children.push(spanMap[spanId]);
          }
        }

        if (ref.refType === 'FOLLOWS_FROM' && !alreadyAddedRootSpans.has(spanId)) {
          addRootSpan(spanId, spanMap, rootSpans, alreadyAddedRootSpans);
        }
      });

      if (references.length === 0 || references.every((ref) => ref.refType === 'FOLLOWS_FROM')) {
        addRootSpan(spanId, spanMap, rootSpans, alreadyAddedRootSpans);
      }
    } else {
      // Data Prepper
      if (span.parentSpanId && spanMap[span.parentSpanId]) {
        spanMap[span.parentSpanId].children.push(spanMap[spanId]);
      } else {
        addRootSpan(spanId, spanMap, rootSpans, alreadyAddedRootSpans);
      }
    }
  });

  return sortBy(rootSpans, (span) => getStartTimeInMs(mode, span));
};

export const getStartTimeInMs = (mode: TraceAnalyticsMode, span: Span) => {
  return mode === 'jaeger'
    ? microToMilliSec(Number(span.startTime))
    : nanoToMilliSec(parseIsoToNano(span.startTime));
};

export const getDurationInMs = (mode: TraceAnalyticsMode, span: Span) => {
  return mode === 'jaeger'
    ? round(microToMilliSec(((span as unknown) as JaegerSpan).duration), 2)
    : round(nanoToMilliSec(span.durationInNanos), 2);
};

export const hasError = (mode: TraceAnalyticsMode, span: any) => {
  return mode === 'jaeger' ? span.tag?.['error'] === true : span['status.code'] === 2;
};
