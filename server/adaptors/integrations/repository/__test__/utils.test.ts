/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { foldResults } from '../utils';

describe('foldResults', () => {
  it('should return an empty array result if input array is empty', () => {
    const results: Array<Result<number>> = [];
    const result = foldResults(results);
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('should fold results into a single array if all input results are ok', () => {
    const results: Array<Result<number>> = [
      { ok: true, value: 1 },
      { ok: true, value: 2 },
      { ok: true, value: 3 },
    ];
    const result = foldResults(results);
    expect(result).toEqual({ ok: true, value: [1, 2, 3] });
  });

  it('should return the first error result encountered if any results are not ok', () => {
    const results: Array<Result<number>> = [
      { ok: true, value: 1 },
      { ok: false, error: new Error('Error 1') },
      { ok: true, value: 3 },
      { ok: false, error: new Error('Error 2') },
    ];
    const result = foldResults(results);
    expect(result).toEqual({ ok: false, error: new Error('Error 1') });
  });
});
