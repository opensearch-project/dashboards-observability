/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lazy-loaded wrapper around `AlertingHome`.
 *
 * The Alert Manager app is gated behind `config.alertManager.enabled` in
 * `plugin.tsx`. Registration is only skipped when the flag is off, but a
 * static `import` of `AlertingHome` from `app.tsx` would still pull the
 * entire alerting tree (charts, flyouts, query services, ECharts) into
 * the main observability chunk for every user — flag on or off.
 *
 * By hiding the `React.lazy` + `React.Suspense` inside this small module,
 * callers can import `AlertingHome` like any other named export. The
 * dynamic `import('./home')` creates a code-split boundary; the chunk is
 * only downloaded when the alerting app is actually mounted.
 */
import React from 'react';

const LazyAlertingHome = React.lazy(() =>
  import('./home').then((module) => ({ default: module.AlertingHome }))
);

/**
 * Drop-in replacement for the eagerly-imported `AlertingHome` component.
 * Owns its own Suspense boundary so consumers (`app.tsx`) don't need to
 * know the component is lazy.
 */
export const AlertingHome: typeof LazyAlertingHome = ((props) => (
  <React.Suspense fallback={<div />}>
    <LazyAlertingHome {...props} />
  </React.Suspense>
)) as typeof LazyAlertingHome;
