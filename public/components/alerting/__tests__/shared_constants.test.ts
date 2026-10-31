/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { sortBySeverity } from '../shared_constants';

describe('sortBySeverity', () => {
  it('orders severities most severe first, not alphabetically', () => {
    expect(sortBySeverity(['info', 'critical', 'medium', 'high', 'low'])).toEqual([
      'critical',
      'high',
      'medium',
      'low',
      'info',
    ]);
  });

  it('puts unknown values last, alphabetically, without mutating the input', () => {
    const input = ['warning', 'info', 'page', 'critical'];
    expect(sortBySeverity(input)).toEqual(['critical', 'info', 'page', 'warning']);
    expect(input).toEqual(['warning', 'info', 'page', 'critical']);
  });
});
