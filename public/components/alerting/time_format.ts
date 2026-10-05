/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import moment from 'moment-timezone';
import { uiSettingsService } from '../../../common/utils';
import { EMPTY_VALUE } from './enum_labels';

/**
 * Timezone-explicit timestamp formatting for alert surfaces.
 *
 * `Date#toLocaleString()` renders in the browser's zone and never says which
 * zone that was, so two engineers reading the same incident see two different
 * "start" times with no way to tell them apart. Everything here honours the
 * `dateFormat:tz` advanced setting and labels the zone it rendered in.
 */

const DEFAULT_TIMESTAMP_FORMAT = 'MMM D, YYYY @ HH:mm:ss';

/**
 * Resolve the timezone the user configured via `dateFormat:tz`, falling back to
 * the browser's zone when the setting is unset or left at `Browser`. Mirrors the
 * resolution Discover and APM use so one instant renders identically everywhere.
 */
export function resolveDisplayTz(): string {
  const tz = uiSettingsService.get('dateFormat:tz');
  if (!tz || tz === 'Browser') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return tz;
}

/**
 * Short label for a zone at a given instant — `UTC`, `PDT`, or a numeric offset
 * such as `+0530` (moment's `z` token emits the offset without a colon) for
 * zones without an abbreviation.
 */
export function getTimezoneLabel(
  value: string | number | Date = Date.now(),
  tz: string = resolveDisplayTz()
): string {
  return moment.tz(value, tz).format('z');
}

export interface FormatTimestampOptions {
  /** Append the timezone label. Defaults to `true` — that's the point of this helper. */
  withZone?: boolean;
  /** moment format string. Defaults to `MMM D, YYYY @ HH:mm:ss`. */
  format?: string;
  /** Rendered when the input is missing or unparseable. Defaults to {@link EMPTY_VALUE}. */
  fallback?: string;
}

/**
 * Format an instant in the user's configured timezone, with that zone named.
 * Returns the fallback (an em dash by default) for missing or unparseable input
 * rather than the `Invalid date` string moment would otherwise produce.
 */
export function formatTimestamp(
  value?: string | number | Date | null,
  options: FormatTimestampOptions = {}
): string {
  const { withZone = true, format = DEFAULT_TIMESTAMP_FORMAT, fallback = EMPTY_VALUE } = options;

  if (value === null || value === undefined || value === '') return fallback;

  // A backend that serializes an epoch as a JSON string (`"1756145045000"`)
  // would otherwise hit `new Date('1756145045000')` → `Invalid Date`. Coerce an
  // all-digit string to a number first so it parses like the numeric epoch path.
  const normalized =
    typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;

  // Normalise through `Date` first: handing moment an unparseable string makes it
  // fall back to the `Date` constructor anyway, but with a deprecation warning
  // that would fire on every malformed timestamp the backend hands us.
  const date = normalized instanceof Date ? normalized : new Date(normalized);
  if (Number.isNaN(date.getTime())) return fallback;

  const tz = resolveDisplayTz();
  const instant = moment.tz(date, tz);
  if (!instant.isValid()) return fallback;

  return withZone ? `${instant.format(format)} ${instant.format('z')}` : instant.format(format);
}
