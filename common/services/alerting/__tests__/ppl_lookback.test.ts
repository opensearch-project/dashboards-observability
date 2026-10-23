/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addTimeFilterToQuery,
  applyLookBackToQuery,
  computeLookBackMinutes,
  findPipeIndices,
  formatPplField,
  formatPplInterval,
  hasUserTimeFilter,
  LOOKBACK_WINDOW_MAX_MINUTES,
  parseLookBackFromQuery,
} from '../ppl_lookback';

const on = (field = '@timestamp', amount = 1, unit = 'hours') => ({
  useLookBackWindow: true,
  lookBackAmount: amount,
  lookBackUnit: unit,
  lookbackTimestampField: field,
});

describe('computeLookBackMinutes', () => {
  it('returns 0 when disabled', () => {
    expect(computeLookBackMinutes({ useLookBackWindow: false, lookBackAmount: 5 })).toBe(0);
  });

  it('returns 0 for non-positive / non-finite amounts', () => {
    expect(computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: 0 })).toBe(0);
    expect(computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: -3 })).toBe(0);
    expect(computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: NaN })).toBe(0);
  });

  it('converts units to minutes, defaulting to hours', () => {
    expect(computeLookBackMinutes(on('t', 30, 'minutes'))).toBe(30);
    expect(computeLookBackMinutes(on('t', 2, 'hours'))).toBe(120);
    expect(computeLookBackMinutes(on('t', 3, 'days'))).toBe(4320);
    expect(computeLookBackMinutes({ useLookBackWindow: true, lookBackAmount: 1 })).toBe(60);
    expect(computeLookBackMinutes(on('t', 1.9, 'hours'))).toBe(114);
    expect(computeLookBackMinutes(on('t', 7, 'weeks'))).toBe(7);
  });

  it('caps at 7 days', () => {
    expect(LOOKBACK_WINDOW_MAX_MINUTES).toBe(7 * 24 * 60);
  });
});

describe('formatPplInterval', () => {
  it('picks the coarsest exact unit', () => {
    expect(formatPplInterval(1440)).toBe('1 DAY');
    expect(formatPplInterval(2880)).toBe('2 DAY');
    expect(formatPplInterval(120)).toBe('2 HOUR');
    expect(formatPplInterval(30)).toBe('30 MINUTE');
    expect(formatPplInterval(90)).toBe('90 MINUTE');
  });
});

describe('formatPplField', () => {
  it('leaves plain identifiers bare', () => {
    expect(formatPplField('@timestamp')).toBe('@timestamp');
    expect(formatPplField('event.time')).toBe('event.time');
    expect(formatPplField('_ts1')).toBe('_ts1');
  });

  it('backtick-quotes anything else', () => {
    expect(formatPplField('my field')).toBe('`my field`');
    expect(formatPplField('ingest-time')).toBe('`ingest-time`');
    expect(formatPplField('1st')).toBe('`1st`');
    expect(formatPplField('a`b')).toBe('`ab`');
  });
});

describe('findPipeIndices', () => {
  it('finds top-level pipes', () => {
    expect(findPipeIndices('source = a | where b | head 1')).toEqual([11, 21]);
    expect(findPipeIndices('source = a')).toEqual([]);
  });

  it('ignores pipes inside single, double, and backtick quotes (incl. escapes)', () => {
    const q = "search source=a msg='x|y' | where m=\"p|q\" and `f|g` = 1 | where n='it\\'s|x'";
    const pipes = findPipeIndices(q);
    expect(pipes).toHaveLength(2);
    expect(q.slice(pipes[0])).toMatch(/^\| where m=/);
  });
});

describe('addTimeFilterToQuery', () => {
  it('inserts at the first pipe so it runs ahead of aggregations', () => {
    expect(addTimeFilterToQuery('source = logs | stats count() by host', 60, '@timestamp')).toBe(
      'source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR) | stats count() by host'
    );
  });

  it('appends when there is no pipe', () => {
    expect(addTimeFilterToQuery('source = logs  ', 30, '@timestamp')).toBe(
      'source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 30 MINUTE)'
    );
  });

  it('skips a pipe inside a quoted string in the first segment', () => {
    expect(addTimeFilterToQuery("search source=a msg='x|y' | head 5", 60, 't')).toBe(
      "search source=a msg='x|y' | where t > DATE_SUB(NOW(), INTERVAL 1 HOUR) | head 5"
    );
  });

  it('preserves line breaks around the pipe', () => {
    expect(addTimeFilterToQuery('source = logs\n| stats count()', 60, 't')).toBe(
      'source = logs\n| where t > DATE_SUB(NOW(), INTERVAL 1 HOUR) | stats count()'
    );
  });

  it('backtick-quotes a non-identifier field', () => {
    expect(addTimeFilterToQuery('source = a', 60, 'ingest-time')).toBe(
      'source = a | where `ingest-time` > DATE_SUB(NOW(), INTERVAL 1 HOUR)'
    );
  });

  it('is a no-op without a query, field, or positive window', () => {
    expect(addTimeFilterToQuery('', 60, 't')).toBe('');
    expect(addTimeFilterToQuery('source = a', 0, 't')).toBe('source = a');
    expect(addTimeFilterToQuery('source = a', 60, '')).toBe('source = a');
  });
});

describe('parseLookBackFromQuery — recognises only the clause the plugin writes', () => {
  it('parses the clause at the first pipe and removes it losslessly', () => {
    expect(
      parseLookBackFromQuery(
        'source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 2 HOUR) | stats count()'
      )
    ).toEqual({
      lookbackTimestampField: '@timestamp',
      lookBackAmount: 2,
      lookBackUnit: 'hours',
      minutes: 120,
      queryWithoutLookBack: 'source = logs | stats count()',
    });
  });

  it('parses the appended form (no other pipes)', () => {
    expect(
      parseLookBackFromQuery('source = a | where t > DATE_SUB(NOW(), INTERVAL 3 DAY)')
    ).toMatchObject({
      lookBackAmount: 3,
      lookBackUnit: 'days',
      queryWithoutLookBack: 'source = a',
    });
  });

  it('accepts plural units, lower case, extra whitespace, and backticked fields', () => {
    expect(
      parseLookBackFromQuery(
        'source = a |  where   t >  date_sub( now( ) , interval 2 hours )  | head 1'
      )
    ).toMatchObject({ lookbackTimestampField: 't', lookBackAmount: 2, lookBackUnit: 'hours' });
    expect(
      parseLookBackFromQuery('source = a | where `my field` > DATE_SUB(NOW(), INTERVAL 5 MINUTE)')
    ).toMatchObject({ lookbackTimestampField: 'my field', lookBackUnit: 'minutes' });
  });

  it('returns null when there is no pipe or no clause', () => {
    expect(parseLookBackFromQuery('')).toBeNull();
    expect(parseLookBackFromQuery('source = a')).toBeNull();
    expect(parseLookBackFromQuery('source = a | where status = 500')).toBeNull();
  });

  it('returns null for a zero-length window', () => {
    expect(
      parseLookBackFromQuery('source = a | where t > DATE_SUB(NOW(), INTERVAL 0 HOUR)')
    ).toBeNull();
  });
});

// Every way a user might write a time range in their own query. None of them is
// the plugin's clause, so on edit each stays in the query exactly as written
// (look-back off), and on save with look-back on the plugin's clause is only
// ADDED — the user's text is never cut, moved, or replaced.
describe('user-written time ranges are never mistaken for the look-back window', () => {
  const cases: Array<[string, string]> = [
    [
      'compound where (and)',
      "source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR) and level = 'ERROR' | stats count()",
    ],
    [
      'compound where (or)',
      'source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR) or sev = 1',
    ],
    ['>= operator', 'source = logs | where @timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)'],
    [
      'reversed comparison',
      'source = logs | where DATE_SUB(NOW(), INTERVAL 1 HOUR) < @timestamp | head 5',
    ],
    [
      'absolute range',
      "source = logs | where @timestamp > '2026-01-01 00:00:00' and @timestamp < '2026-01-02 00:00:00'",
    ],
    [
      'legacy absolute TIMESTAMP() form',
      "source = logs | where @timestamp > TIMESTAMP('2026-01-01 00:00:00') and @timestamp < TIMESTAMP('2026-01-02 00:00:00') | stats count()",
    ],
    ['BETWEEN', "source = logs | where @timestamp BETWEEN '2026-01-01' AND '2026-01-02'"],
    [
      'relative clause later in the pipeline',
      'source = logs | eval ts = @timestamp | where ts > DATE_SUB(NOW(), INTERVAL 1 HOUR) | stats count()',
    ],
    [
      'relative clause after an aggregation',
      'source = logs | stats count() by span(@timestamp, 5m) as b | where b > DATE_SUB(NOW(), INTERVAL 1 HOUR)',
    ],
    [
      'long relative window later in the pipeline',
      'source = logs | where a = 1 | where t > DATE_SUB(NOW(), INTERVAL 14 DAY)',
    ],
    ['DATE_ADD instead of DATE_SUB', 'source = logs | where t > DATE_ADD(NOW(), INTERVAL -1 HOUR)'],
    [
      'clause-shaped text inside a string',
      "source = logs | where msg = '| where t > DATE_SUB(NOW(), INTERVAL 1 HOUR)'",
    ],
  ];

  it.each(cases)('%s: not parsed as a look-back window (edit keeps it verbatim)', (_, q) => {
    expect(parseLookBackFromQuery(q)).toBeNull();
  });

  it.each(cases)('%s: saving with look-back on only adds the clause', (_, q) => {
    const saved = applyLookBackToQuery(q, on('@timestamp', 30, 'minutes'));
    const parsed = parseLookBackFromQuery(saved);
    expect(parsed).not.toBeNull();
    expect(parsed!.queryWithoutLookBack).toBe(q);
    expect(parsed!.minutes).toBe(30);
  });

  it.each(cases)('%s: saving with look-back off keeps the query byte-identical', (_, q) => {
    expect(applyLookBackToQuery(q, { ...on(), useLookBackWindow: false })).toBe(q);
  });

  it('a user clause identical to the plugin clause is kept when look-back is added', () => {
    const q = 'source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE) | head 5';
    const saved = applyLookBackToQuery(q, on());
    expect(saved).toBe(
      'source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR) | where @timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE) | head 5'
    );
    // Edit restores the user's query (their 5-minute clause) and the 1-hour window.
    expect(parseLookBackFromQuery(saved)).toMatchObject({
      minutes: 60,
      queryWithoutLookBack: q,
    });
  });
});

describe('round trip: save then edit restores the user query exactly', () => {
  const queries = [
    'source = logs',
    'source = logs | stats count() by host',
    'source = logs\n| where level = "ERROR"\n| stats count()',
    "search source=logs msg='a|b' | head 10",
    'source = logs-*, metrics-* | where x = 1 | sort - @timestamp',
  ];
  const fields = ['@timestamp', 'time', 'event.created', 'ingest-time', 'my field'];

  it.each(queries)('%s', (q) => {
    for (const field of fields) {
      for (const [amount, unit] of [
        [45, 'minutes'],
        [2, 'hours'],
        [7, 'days'],
      ] as const) {
        const saved = applyLookBackToQuery(q, on(field, amount, unit));
        const parsed = parseLookBackFromQuery(saved)!;
        expect(parsed.queryWithoutLookBack).toBe(q);
        expect(parsed.lookbackTimestampField).toBe(field);
        expect(parsed.minutes).toBe(computeLookBackMinutes(on(field, amount, unit)));
        // Re-saving the edited form reproduces the stored query.
        expect(applyLookBackToQuery(parsed.queryWithoutLookBack, on(field, amount, unit))).toBe(
          saved
        );
      }
    }
  });
});

describe('applyLookBackToQuery', () => {
  it('adds the clause when enabled with a field', () => {
    expect(applyLookBackToQuery('source = a | head 1', on())).toBe(
      'source = a | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR) | head 1'
    );
  });

  it('returns the query unchanged when disabled, fieldless, or zero-length', () => {
    const q = 'source = a | where @timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE)';
    expect(applyLookBackToQuery(q, { ...on(), useLookBackWindow: false })).toBe(q);
    expect(applyLookBackToQuery(q, { ...on(), lookbackTimestampField: '' })).toBe(q);
    expect(applyLookBackToQuery(q, on('@timestamp', 0))).toBe(q);
  });
});

describe('hasUserTimeFilter', () => {
  it.each([
    ['source = a | where @timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE)'],
    ["source = a | where @timestamp > '2026-01-01' and @timestamp < '2026-01-02'"],
    ["source = a | where level = 'E' and @timestamp >= '2026-01-01'"],
    ["source = a | WHERE @timestamp BETWEEN '2026-01-01' AND '2026-01-02'"],
    ['source = a | where `@timestamp` > NOW()'],
    ['source = a | where (@timestamp > NOW())'],
  ])('detects a where on the field: %s', (q) => {
    expect(hasUserTimeFilter(q, '@timestamp')).toBe(true);
  });

  it.each([
    ['source = a'],
    ['source = a | where level = 1'],
    ["source = a | where msg = '@timestamp > x'"],
    ['source = a | where @timestamp_ingest > NOW()'],
    ['source = a | where x.@timestamp > NOW()'],
    ['source = a | stats count() by span(@timestamp, 1h)'],
    ['source = a | sort - @timestamp | eval d = @timestamp'],
  ])('ignores non-filter mentions: %s', (q) => {
    expect(hasUserTimeFilter(q, '@timestamp')).toBe(false);
  });

  it('matches the exact field only, including dotted names', () => {
    expect(hasUserTimeFilter('source = a | where event.time > NOW()', 'event.time')).toBe(true);
    expect(hasUserTimeFilter('source = a | where eventXtime > NOW()', 'event.time')).toBe(false);
  });

  it('is false without a query or field', () => {
    expect(hasUserTimeFilter('', '@timestamp')).toBe(false);
    expect(hasUserTimeFilter('source = a | where t > 1', '')).toBe(false);
  });
});
