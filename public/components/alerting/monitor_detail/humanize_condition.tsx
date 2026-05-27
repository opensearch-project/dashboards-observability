/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Translate a Painless trigger-condition script into readable text for the
 * monitor-detail flyout. Two patterns currently recognized:
 *   - `return true` → "Always trigger"
 *   - `ctx.results[0].hits.total.value <op> N` → "Document count <op> N"
 *
 * Anything else falls through to the raw condition rendered in a `<code>`
 * element. Pulled out of `monitor_detail_flyout.tsx` so it can be tested
 * directly and so the flyout component stays focused on layout.
 */
import React from 'react';
import { i18n } from '@osd/i18n';

export function humanizeCondition(condition: string): React.ReactNode {
  const trimmed = condition.trim();

  // "return true" → "Always trigger"
  if (/^return\s+true\s*;?\s*$/.test(trimmed)) {
    return i18n.translate('observability.alerting.monitorDetailFlyout.condition.alwaysTrigger', {
      defaultMessage: 'Always trigger',
    });
  }

  // ctx.results[0].hits.total.value <op> N → "Document count <op> N"
  const docCountMatch = trimmed.match(
    /ctx\.results\[0]\.hits\.total\.value\s*(>=|<=|!=|==|>|<)\s*([\d.]+)/
  );
  if (docCountMatch) {
    return i18n.translate('observability.alerting.monitorDetailFlyout.condition.documentCount', {
      defaultMessage: 'Document count {operator} {value}',
      values: { operator: docCountMatch[1], value: docCountMatch[2] },
    });
  }

  // Anything else: show the raw condition in a code style
  return <code>{condition}</code>;
}
