/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeoutError } from '../timeout_error';

describe('TimeoutError', () => {
  it('is an instance of Error', () => {
    expect(new TimeoutError('timed out', 3000)).toBeInstanceOf(Error);
  });

  it('has name "TimeoutError"', () => {
    expect(new TimeoutError('timed out', 3000).name).toBe('TimeoutError');
  });

  it('preserves message and timeoutMs', () => {
    const err = new TimeoutError('slow', 5000);
    expect(err.message).toBe('slow');
    expect(err.timeoutMs).toBe(5000);
  });
});
