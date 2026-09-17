/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addTimeFilterToQuery,
  applyLookBackToQuery,
  computeLookBackMinutes,
  formatPplInterval,
  LOOKBACK_WINDOW_MAX_MINUTES,
  parseLookBackFromQuery,
  stripTimeFilterFromQuery,
} from '../ppl_lookback';

describe('computeLookBackMinutes', () => {
  it('returns 0 when disabled', () => {
    expect(computeLookBackMinutes({ useLookBackWindow: false, lookBackAmount: 5 })).toBe(0);
  });

  it('returns 0 for non-positive / non-finite amounts', () => {
    expect(computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: 0 })).toBe(0);
    expect(computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: -3 })).toBe(0);
    expect(
      computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: NaN as unknown as number })
    ).toBe(0);
  });

  it('converts units to minutes', () => {
    expect(
      computeLookBackMinutes({
        useLookBackWindow: true,
        lookBackAmount: 30,
        lookBackUnit: 'minutes',
      })
    ).toBe(30);
    expect(
      computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: 2, lookBackUnit: 'hours' })
    ).toBe(120);
    expect(
      computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: 3, lookBackUnit: 'days' })
    ).toBe(4320);
  });

  it('defaults to hours and floors fractional amounts', () => {
    expect(computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: 1 })).toBe(60);
    expect(
      computeLookBackMinutes({
        useLookBackWindow: true,
        lookBackAmount: 1.9,
        lookBackUnit: 'hours',
      })
    ).toBe(114);
  });
});

describe('formatPplInterval', () => {
  it('picks the coarsest exact unit', () => {
    expect(formatPplInterval(1440)).toBe('1 DAY');
    expect(formatPplInterval(2880)).toBe('2 DAY');
    expect(formatPplInterval(120)).toBe('2 HOUR');
    expect(formatPplInterval(60)).toBe('1 HOUR');
    expect(formatPplInterval(30)).toBe('30 MINUTE');
    expect(formatPplInterval(90)).toBe('90 MINUTE');
  });
});

describe('addTimeFilterToQuery', () => {
  it('injects before the first pipe so it runs ahead of aggregations', () => {
    const q = 'source = logs-* | stats count() by host';
    expect(addTimeFilterToQuery(q, 60, '@timestamp')).toBe(
      'source = logs-* | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR) | stats count() by host'
    );
  });

  it('appends when there is no pipe', () => {
    expect(addTimeFilterToQuery('source = logs-*', 30, '@timestamp')).toBe(
      'source = logs-* | where @timestamp > DATE_SUB(NOW(), INTERVAL 30 MINUTE)'
    );
  });

  it('is idempotent — re-injecting replaces rather than stacks', () => {
    const once = addTimeFilterToQuery('source = logs-* | head 10', 60, '@timestamp');
    const twice = addTimeFilterToQuery(once, 120, '@timestamp');
    expect(twice).toBe(
      'source = logs-* | where @timestamp > DATE_SUB(NOW(), INTERVAL 2 HOUR) | head 10'
    );
    expect((twice.match(/where @timestamp/g) || []).length).toBe(1);
  });

  it('returns the query unchanged when field or minutes are missing', () => {
    expect(addTimeFilterToQuery('source = a', 0, '@timestamp')).toBe('source = a');
    expect(addTimeFilterToQuery('source = a', 60, '')).toBe('source = a');
  });
});

describe('stripTimeFilterFromQuery', () => {
  it('removes the sliding-window form', () => {
    const q = 'source = logs-* | where @timestamp > DATE_SUB(NOW(), INTERVAL 2 HOUR) | head 5';
    expect(stripTimeFilterFromQuery(q, '@timestamp')).toBe('source = logs-* | head 5');
  });

  it('removes the legacy absolute-timestamp form', () => {
    const q =
      "source = logs-* | where ts > TIMESTAMP('2020-01-01 00:00:00') and ts < TIMESTAMP('2020-01-02 00:00:00') | head 5";
    expect(stripTimeFilterFromQuery(q, 'ts')).toBe('source = logs-* | head 5');
  });

  it('escapes regex-significant characters in the field name', () => {
    const q = 'source = a | where my.field > DATE_SUB(NOW(), INTERVAL 1 HOUR)';
    expect(stripTimeFilterFromQuery(q, 'my.field')).toBe('source = a');
  });

  it('leaves other where clauses intact', () => {
    const q =
      'source = logs-* | where status = 500 | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)';
    expect(stripTimeFilterFromQuery(q, '@timestamp')).toBe('source = logs-* | where status = 500');
  });
});

describe('applyLookBackToQuery', () => {
  const base = 'source = logs-* | stats count()';

  it('injects when enabled with a field', () => {
    expect(
      applyLookBackToQuery(base, {
        useLookBackWindow: true,
        lookBackAmount: 1,
        lookBackUnit: 'hours',
        lookbackTimestampField: '@timestamp',
      })
    ).toContain('where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)');
  });

  it('strips a previously injected filter when disabled', () => {
    const injected = addTimeFilterToQuery(base, 60, '@timestamp');
    expect(
      applyLookBackToQuery(injected, {
        useLookBackWindow: false,
        lookbackTimestampField: '@timestamp',
      })
    ).toBe(base);
  });

  it('is a no-op with no timestamp field', () => {
    expect(applyLookBackToQuery(base, { useLookBackWindow: true, lookBackAmount: 1 })).toBe(base);
  });
});

describe('parseLookBackFromQuery', () => {
  it('parses the field, amount, and unit from an injected filter', () => {
    expect(
      parseLookBackFromQuery(
        'source = logs-* | where @timestamp > DATE_SUB(NOW(), INTERVAL 2 HOUR) | stats count()'
      )
    ).toEqual({
      lookbackTimestampField: '@timestamp',
      lookBackAmount: 2,
      lookBackUnit: 'hours',
      minutes: 120,
    });
  });

  it('parses MINUTE and DAY units and dotted field names', () => {
    expect(
      parseLookBackFromQuery('source = a | where my.ts > DATE_SUB(NOW(), INTERVAL 30 MINUTE)')
    ).toMatchObject({
      lookbackTimestampField: 'my.ts',
      lookBackAmount: 30,
      lookBackUnit: 'minutes',
    });
    expect(
      parseLookBackFromQuery('source = a | where ts > DATE_SUB(NOW(), INTERVAL 3 DAY)')
    ).toMatchObject({ lookBackAmount: 3, lookBackUnit: 'days', minutes: 4320 });
  });

  it('returns null when there is no look-back filter', () => {
    expect(parseLookBackFromQuery('source = a | where status = 500')).toBeNull();
    expect(parseLookBackFromQuery('')).toBeNull();
  });

  it('round-trips with addTimeFilterToQuery', () => {
    const q = addTimeFilterToQuery('source = logs-* | head 5', 120, 'event_time');
    expect(parseLookBackFromQuery(q)).toMatchObject({
      lookbackTimestampField: 'event_time',
      lookBackAmount: 2,
      lookBackUnit: 'hours',
    });
  });
});

describe('LOOKBACK_WINDOW_MAX_MINUTES', () => {
  it('is 7 days', () => {
    expect(LOOKBACK_WINDOW_MAX_MINUTES).toBe(7 * 24 * 60);
  });
});
