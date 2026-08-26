/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Translate a trigger-condition expression into readable text for the
 * monitor-detail flyout. Recognized shapes (all case-insensitive on the
 * comparison, tolerant of surrounding whitespace):
 *   - `return true`                                   → "Always trigger"
 *   - `ctx.results[0].hits.total.value <op> N`        → "Document count <op> N"
 *   - `ctx.results[0].hits.total <op> N`              → "Document count <op> N"
 *   - `ctx.results[0].aggregations.<name>.value <op> N`
 *                                                     → 'Aggregation "<name>" <op> N'
 *   - `count <op> N` (PPL number-of-results triggers) → "Result count <op> N"
 *   - `params._count <op> N` (bucket per-bucket)      → "Bucket document count <op> N"
 *
 * Anything genuinely un-humanizable (arbitrary Painless / custom scripts) is
 * labelled "Custom script" with the raw source tucked behind an on-demand
 * disclosure rather than dumped inline as if it were prose — a raw script blob
 * interpolated into a "Condition: …" sentence is unreadable and misleading.
 *
 * Pulled out of `monitor_detail_flyout.tsx` so it can be tested directly and so
 * the flyout component stays focused on layout.
 */
import React, { useState } from 'react';
import { EuiAccordion, EuiCodeBlock, htmlIdGenerator } from '@elastic/eui';
import { i18n } from '@osd/i18n';

// Comparison operators OS Alerting / PPL emit, longest-first so `>=` wins over `>`.
const OPERATOR = '(>=|<=|!=|==|=|>|<)';

const makeAccordionId = htmlIdGenerator('humanizeCondition');

/**
 * Fallback rendering for a condition we can't translate: a clear "Custom
 * script" label plus a collapsible code block with the raw source. Keyboard
 * users reach the source via the accordion's native button; the source is
 * never shown inline as prose.
 */
export const CustomScriptCondition: React.FC<{ source: string }> = ({ source }) => {
  // Stable across re-renders so the disclosure keeps its open/closed state.
  const [accordionId] = useState(makeAccordionId);
  const label = i18n.translate('observability.alerting.monitorDetailFlyout.condition.customScript', {
    defaultMessage: 'Custom script',
  });
  return (
    <>
      <span data-test-subj="monitorConditionCustomScript">{label}</span>{' '}
      <EuiAccordion
        id={accordionId}
        paddingSize="xs"
        buttonContent={i18n.translate(
          'observability.alerting.monitorDetailFlyout.condition.showScript',
          { defaultMessage: 'Show script' }
        )}
      >
        <div data-test-subj="monitorConditionCustomScriptSource">
          {/*
            `painless` is not a registered refractor language, and EuiCodeBlock
            throws "Unknown language" at render for anything unregistered. Use
            `java`, which Painless is a subset of, so the block highlights
            instead of crashing the flyout.
          */}
          <EuiCodeBlock language="java" fontSize="s" paddingSize="s" isCopyable>
            {source}
          </EuiCodeBlock>
        </div>
      </EuiAccordion>
    </>
  );
};

export function humanizeCondition(condition: string): React.ReactNode {
  const trimmed = (condition ?? '').trim();

  // "return true" → "Always trigger"
  if (/^return\s+true\s*;?\s*$/i.test(trimmed)) {
    return i18n.translate('observability.alerting.monitorDetailFlyout.condition.alwaysTrigger', {
      defaultMessage: 'Always trigger',
    });
  }

  // ctx.results[0].hits.total(.value)? <op> N → "Document count <op> N"
  const docCountMatch = trimmed.match(
    new RegExp(`ctx\\.results\\[0]\\.hits\\.total(?:\\.value)?\\s*${OPERATOR}\\s*([\\d.]+)`)
  );
  if (docCountMatch) {
    return i18n.translate('observability.alerting.monitorDetailFlyout.condition.documentCount', {
      defaultMessage: 'Document count {operator} {value}',
      values: { operator: docCountMatch[1], value: docCountMatch[2] },
    });
  }

  // ctx.results[0].aggregations.<name>.value <op> N → 'Aggregation "<name>" <op> N'
  const aggMatch = trimmed.match(
    new RegExp(`ctx\\.results\\[0]\\.aggregations\\.([\\w.-]+)\\.value\\s*${OPERATOR}\\s*([\\d.]+)`)
  );
  if (aggMatch) {
    return i18n.translate('observability.alerting.monitorDetailFlyout.condition.aggregation', {
      defaultMessage: 'Aggregation "{name}" {operator} {value}',
      values: { name: aggMatch[1], operator: aggMatch[2], value: aggMatch[3] },
    });
  }

  // params._count <op> N (bucket-level per-bucket condition) → "Bucket document count <op> N"
  const bucketCountMatch = trimmed.match(new RegExp(`params\\._count\\s*${OPERATOR}\\s*([\\d.]+)`));
  if (bucketCountMatch) {
    return i18n.translate('observability.alerting.monitorDetailFlyout.condition.bucketCount', {
      defaultMessage: 'Bucket document count {operator} {value}',
      values: { operator: bucketCountMatch[1], value: bucketCountMatch[2] },
    });
  }

  // `count <op> N` — the synthetic string built for PPL number-of-results triggers.
  const resultCountMatch = trimmed.match(new RegExp(`^count\\s+${OPERATOR}\\s*([\\d.]+)$`, 'i'));
  if (resultCountMatch) {
    return i18n.translate('observability.alerting.monitorDetailFlyout.condition.resultCount', {
      defaultMessage: 'Result count {operator} {value}',
      values: { operator: resultCountMatch[1], value: resultCountMatch[2] },
    });
  }

  // Anything else: label as a custom script with the raw source on demand.
  return <CustomScriptCondition source={condition} />;
}
