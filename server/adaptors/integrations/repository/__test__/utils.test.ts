/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { compareVersions, foldResults } from '../integration_reader';

describe('compareVersions', () => {
  it('should return 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('should return -1 for a < b', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
    expect(compareVersions('1.2.3', '1.3.0')).toBe(-1);
    expect(compareVersions('1.2.3', '2.0.0')).toBe(-1);
  });

  it('should return 1 for a > b', () => {
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
    expect(compareVersions('1.3.0', '1.2.3')).toBe(1);
    expect(compareVersions('2.0.0', '1.2.3')).toBe(1);
  });

  it('should handle versions with different numbers of parts', () => {
    expect(compareVersions('1.2.3', '1.2')).toBe(1);
    expect(compareVersions('1.2', '1.2.3')).toBe(-1);
    expect(compareVersions('1.2.3', '1.2.3.4')).toBe(-1);
  });
});

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
