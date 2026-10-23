/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { cloudWatchAlarmNameSchema } from '../schema_helpers';

describe('cloudWatchAlarmNameSchema', () => {
  it('accepts generated names with "/" and "..", which CloudWatch allows', () => {
    expect(
      cloudWatchAlarmNameSchema.validate('TargetTracking-table/MyTable-AlarmHigh-1a2b3c')
    ).toBe('TargetTracking-table/MyTable-AlarmHigh-1a2b3c');
    expect(cloudWatchAlarmNameSchema.validate('a..b')).toBe('a..b');
    expect(cloudWatchAlarmNameSchema.validate('checkout errors (p99)')).toBe(
      'checkout errors (p99)'
    );
  });

  it('rejects empty, over-long and control-character names', () => {
    expect(() => cloudWatchAlarmNameSchema.validate('')).toThrow();
    expect(() => cloudWatchAlarmNameSchema.validate('x'.repeat(256))).toThrow();
    expect(() => cloudWatchAlarmNameSchema.validate('bad\nname')).toThrow();
    expect(() => cloudWatchAlarmNameSchema.validate('bad\u0000name')).toThrow();
    expect(() => cloudWatchAlarmNameSchema.validate('bad\u007fname')).toThrow();
  });
});
