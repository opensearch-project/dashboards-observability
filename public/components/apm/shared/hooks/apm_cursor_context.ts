/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';

/**
 * Cross-chart cursor sync for APM line charts.
 *
 * Ported from the OSD Explore "metrics" flavor
 * (src/plugins/explore/public/application/pages/metrics/explore/hooks/cursor_context.ts),
 * with one adaptation: APM charts use `xAxis.type: 'time'` with real
 * `[timestamp, value]` data and may render at different steps/resolutions per
 * chart, so the shared cursor is keyed on the hovered **timestamp** (epoch ms)
 * rather than an array index. Each subscribing chart converts the timestamp to
 * its own x-pixel via `convertToPixel`.
 *
 * The bus is a plain event emitter kept intentionally OUTSIDE React state, so
 * high-frequency mousemove updates never trigger re-renders.
 */
export interface ApmCursorState {
  /** Hovered x position as an epoch-millisecond timestamp. */
  time: number;
  /** Fractional vertical position within the plot area (0 top .. 1 bottom). */
  yRatio: number;
}

export interface ApmCursorBus {
  subscribe: (cb: (state: ApmCursorState | null) => void) => () => void;
  publish: (state: ApmCursorState | null) => void;
}

/**
 * Create an independent cursor bus. Wrap a page's chart group in a single
 * `ApmCursorContext.Provider value={useMemo(() => createApmCursorBus(), [])}`
 * so only charts within that provider sync with each other.
 */
export const createApmCursorBus = (): ApmCursorBus => {
  const listeners = new Set<(state: ApmCursorState | null) => void>();
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    publish(state) {
      listeners.forEach((cb) => cb(state));
    },
  };
};

export const ApmCursorContext = createContext<ApmCursorBus | null>(null);

/**
 * Returns the current cursor bus, or `null` when no provider is present — in
 * which case the chart behaves standalone (no cross-chart sync).
 */
export const useApmCursorBus = (): ApmCursorBus | null => useContext(ApmCursorContext);
