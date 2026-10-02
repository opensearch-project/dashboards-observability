/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import {
  isValidUrlTimeBound,
  readUrlTimeRange,
  splitHash,
  useTimeRangeUrlSync,
} from '../use_time_range_url_sync';
import { TimeRange } from '../../../common/types/service_types';

const PAGE = '#/page';
const isPage = (path: string) => path === PAGE;

const setHash = (hash: string) => window.history.replaceState(null, '', hash);
const hashParams = () => splitHash().params;
const fireHashChange = (hash: string) =>
  act(() => {
    setHash(hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

const renderSync = (timeRange: TimeRange, pageKey?: string) =>
  renderHook(
    ({ range, key }: { range: TimeRange; key?: string }) =>
      useTimeRangeUrlSync({ timeRange: range, isCurrentPage: isPage, pageKey: key }),
    { initialProps: { range: timeRange, key: pageKey } }
  );

describe('isValidUrlTimeBound', () => {
  it.each([
    ['now-15m'],
    ['now'],
    ['now+1h'],
    ['now/d'],
    ['now/w'],
    ['now-1d/d'],
    ['2026-09-29T20:00:00.000Z'],
    ['2026-09-29T20:00:00+02:00'],
  ])('accepts %s', (value) => {
    expect(isValidUrlTimeBound(value)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['null', null],
    ['markup', '<script>'],
    ['unresolvable datemath', 'now-'],
    ['too long', `now-${'1'.repeat(300)}m`],
  ])('rejects %s', (_label, value) => {
    expect(isValidUrlTimeBound(value as string | null)).toBe(false);
  });
});

describe('useTimeRangeUrlSync', () => {
  it('keeps a valid deep-linked range on mount (the URL wins)', () => {
    setHash(`${PAGE}?from=now-7d&to=now&tab=x`);
    renderSync({ from: 'now-15m', to: 'now' });
    expect(hashParams().get('from')).toBe('now-7d');
    expect(hashParams().get('tab')).toBe('x');
  });

  it('backfills a URL with no range on mount, keeping other params', () => {
    setHash(`${PAGE}?tab=x`);
    renderSync({ from: 'now-15m', to: 'now' });
    expect(splitHash().path).toBe(PAGE);
    expect(hashParams().get('from')).toBe('now-15m');
    expect(hashParams().get('to')).toBe('now');
    expect(hashParams().get('tab')).toBe('x');
  });

  it('treats an invalid range as missing on mount and backfills it', () => {
    setHash(`${PAGE}?from=%3Cscript%3E&to=now`);
    renderSync({ from: 'now-15m', to: 'now' });
    expect(hashParams().get('from')).toBe('now-15m');
  });

  it('writes a later time range change to the URL', () => {
    setHash(`${PAGE}?from=now-15m&to=now`);
    const { rerender } = renderSync({ from: 'now-15m', to: 'now' });
    rerender({ range: { from: 'now/d', to: 'now/d' } });
    expect(hashParams().get('from')).toBe('now/d');
    expect(hashParams().get('to')).toBe('now/d');
  });

  it('round-trips a relative-future range through URL encoding', () => {
    setHash(`${PAGE}?from=now-15m&to=now`);
    const { rerender } = renderSync({ from: 'now-15m', to: 'now' });
    rerender({ range: { from: 'now', to: 'now+1h' } });
    expect(window.location.hash).toContain('to=now%2B1h');
    expect(readUrlTimeRange(hashParams())).toEqual({ from: 'now', to: 'now+1h' });
  });

  it('round-trips an absolute ISO range', () => {
    setHash(`${PAGE}?from=now-15m&to=now`);
    const { rerender } = renderSync({ from: 'now-15m', to: 'now' });
    const iso = { from: '2026-09-29T20:00:00.000Z', to: '2026-09-29T21:00:00.000Z' };
    rerender({ range: iso });
    expect(readUrlTimeRange(hashParams())).toEqual(iso);
  });

  it('backfills a hashchange onto this page that carries no range', () => {
    setHash(`${PAGE}?from=now-15m&to=now`);
    renderSync({ from: 'now-15m', to: 'now' });
    fireHashChange(`${PAGE}?tab=y&dependency=db`);
    expect(hashParams().get('from')).toBe('now-15m');
    expect(hashParams().get('tab')).toBe('y');
    expect(hashParams().get('dependency')).toBe('db');
  });

  it('never touches another page’s URL on hashchange', () => {
    setHash(`${PAGE}?from=now-15m&to=now`);
    renderSync({ from: 'now-15m', to: 'now' });
    fireHashChange('#/services');
    expect(window.location.hash).toBe('#/services');
  });

  it('never touches another page’s URL on a time range change', () => {
    setHash(`${PAGE}?from=now-15m&to=now`);
    const { rerender } = renderSync({ from: 'now-15m', to: 'now' });
    setHash('#/other?tab=z');
    rerender({ range: { from: 'now-1h', to: 'now' } });
    expect(window.location.hash).toBe('#/other?tab=z');
  });

  it('treats a pageKey change like a fresh mount', () => {
    setHash(`${PAGE}?from=now-15m&to=now`);
    const { rerender } = renderSync({ from: 'now-15m', to: 'now' }, 'a');

    // New page instance with its own valid range: the URL wins.
    setHash(`${PAGE}?from=now-7d&to=now`);
    rerender({ range: { from: 'now-15m', to: 'now' }, key: 'b' });
    expect(hashParams().get('from')).toBe('now-7d');

    // New page instance with no range: backfilled.
    setHash(`${PAGE}?tab=x`);
    rerender({ range: { from: 'now-15m', to: 'now' }, key: 'c' });
    expect(hashParams().get('from')).toBe('now-15m');
  });
});
