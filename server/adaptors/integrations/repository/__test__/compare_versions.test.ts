/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { compareVersions } from '../integration_reader';

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
