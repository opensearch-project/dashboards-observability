/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { uiSettingsService } from '../../../../common/utils';
import { EMPTY_VALUE } from '../enum_labels';
import { formatTimestamp, getTimezoneLabel, resolveDisplayTz } from '../time_format';

// 2026-08-25T18:04:05Z — a fixed instant so assertions don't depend on "now".
const INSTANT = '2026-08-25T18:04:05.000Z';

describe('time_format', () => {
  let getSpy: jest.SpyInstance;

  beforeEach(() => {
    getSpy = jest.spyOn(uiSettingsService, 'get');
  });

  afterEach(() => {
    getSpy.mockRestore();
  });

  describe('resolveDisplayTz', () => {
    it('uses the configured dateFormat:tz', () => {
      getSpy.mockReturnValue('America/Los_Angeles');
      expect(resolveDisplayTz()).toBe('America/Los_Angeles');
    });

    it('falls back to the browser zone when unset or left at Browser', () => {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      getSpy.mockReturnValue(undefined);
      expect(resolveDisplayTz()).toBe(browserTz);
      getSpy.mockReturnValue('Browser');
      expect(resolveDisplayTz()).toBe(browserTz);
    });
  });

  describe('formatTimestamp', () => {
    it('renders in the configured zone and names that zone', () => {
      getSpy.mockReturnValue('UTC');
      expect(formatTimestamp(INSTANT)).toBe('Aug 25, 2026 @ 18:04:05 UTC');
    });

    it('shifts the wall-clock time to the configured zone', () => {
      getSpy.mockReturnValue('America/Los_Angeles');
      // 18:04 UTC is 11:04 PDT on this date.
      expect(formatTimestamp(INSTANT)).toBe('Aug 25, 2026 @ 11:04:05 PDT');
    });

    it('omits the zone label when asked', () => {
      getSpy.mockReturnValue('UTC');
      expect(formatTimestamp(INSTANT, { withZone: false })).toBe('Aug 25, 2026 @ 18:04:05');
    });

    it('honors a custom format', () => {
      getSpy.mockReturnValue('UTC');
      expect(formatTimestamp(INSTANT, { format: 'YYYY-MM-DD', withZone: false })).toBe(
        '2026-08-25'
      );
    });

    it('accepts epoch millis and Date instances', () => {
      getSpy.mockReturnValue('UTC');
      const ms = new Date(INSTANT).getTime();
      expect(formatTimestamp(ms)).toBe('Aug 25, 2026 @ 18:04:05 UTC');
      expect(formatTimestamp(new Date(INSTANT))).toBe('Aug 25, 2026 @ 18:04:05 UTC');
    });

    it('accepts an epoch serialized as a string (backend JSON drift)', () => {
      getSpy.mockReturnValue('UTC');
      const ms = String(new Date(INSTANT).getTime());
      // `new Date('1756145045000')` is Invalid Date; the all-digit string must
      // be coerced to a number so it parses like the numeric epoch path.
      expect(formatTimestamp(ms)).toBe('Aug 25, 2026 @ 18:04:05 UTC');
    });

    it('returns the placeholder rather than "Invalid date" for bad input', () => {
      getSpy.mockReturnValue('UTC');
      expect(formatTimestamp(undefined)).toBe(EMPTY_VALUE);
      expect(formatTimestamp(null)).toBe(EMPTY_VALUE);
      expect(formatTimestamp('')).toBe(EMPTY_VALUE);
      expect(formatTimestamp('not a timestamp')).toBe(EMPTY_VALUE);
    });

    it('honors a caller-supplied fallback', () => {
      getSpy.mockReturnValue('UTC');
      expect(formatTimestamp(null, { fallback: 'Never' })).toBe('Never');
    });
  });

  describe('getTimezoneLabel', () => {
    it('labels a zone with an abbreviation where one exists', () => {
      getSpy.mockReturnValue('UTC');
      expect(getTimezoneLabel(INSTANT)).toBe('UTC');
    });

    it('uses the zone abbreviation when the zone has one', () => {
      getSpy.mockReturnValue('Asia/Kolkata');
      expect(getTimezoneLabel(INSTANT)).toBe('IST');
    });

    it('falls back to a numeric offset for zones without an abbreviation', () => {
      getSpy.mockReturnValue('Asia/Kathmandu');
      expect(getTimezoneLabel(INSTANT)).toBe('+0545');
    });
  });
});
