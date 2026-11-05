/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { chunkNames, runBatched } from '../name_batches';
import { APPLICATION_MAP_CONSTANTS } from '../../../common/constants';
import { escapePromQLRegex } from '../../../query_services/query_requests/escape_utils';

const { METRICS_BATCH_MAX_CHARS } = APPLICATION_MAP_CONSTANTS;

describe('chunkNames', () => {
  it('measures the escaped regex, not the raw names', () => {
    // Host names are mostly dots, which escape to `\\\\.` inside the PromQL string.
    const hosts = Array.from({ length: 60 }, (_, i) => `api.${i}.partner.example.com`);
    const batches = chunkNames(hosts);
    expect(batches.flat()).toEqual(hosts);
    batches.forEach((b) => {
      const regex = b.map(escapePromQLRegex).join('|');
      expect(regex.length).toBeLessThanOrEqual(METRICS_BATCH_MAX_CHARS);
    });
    // The raw names alone would fit in fewer batches than the escaped ones need.
    const rawChars = hosts.reduce((n, h) => n + h.length + 1, 0);
    const escapedChars = hosts.reduce((n, h) => n + escapePromQLRegex(h).length + 1, 0);
    expect(escapedChars).toBeGreaterThan(rawChars);
  });

  it('keeps a single over-long name as its own batch', () => {
    const long = 'x'.repeat(METRICS_BATCH_MAX_CHARS + 10);
    expect(chunkNames(['a', long, 'b'])).toEqual([['a'], [long], ['b']]);
  });
});

describe('runBatched', () => {
  it('limits concurrency and keeps results in batch order, including failures', async () => {
    let inFlight = 0;
    let max = 0;
    const results = await runBatched(
      [1, 2, 3, 4, 5],
      async (n) => {
        inFlight += 1;
        max = Math.max(max, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        if (n === 3) throw new Error('three');
        return n * 10;
      },
      2
    );
    expect(max).toBe(2);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'x'))).toEqual([
      10,
      20,
      'x',
      40,
      50,
    ]);
  });
});
