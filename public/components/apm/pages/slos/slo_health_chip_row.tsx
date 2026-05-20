/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared SLO health chip row. Rendered by the Services Home header panel and
 * (starting in M3) the Service Details SLOs tab, so both surfaces use the
 * same vocabulary, ordering, and fold rules.
 *
 * i18n keys are kept under `observability.apm.services.sloHealth.*` so that
 * translations already wired for the Services Home panel continue to apply
 * after the extraction.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiHealth } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { SloHealthBucket } from './slo_health_summary';
import { TABULAR_NUMS_STYLE } from '../../../../../common/slo/format';

interface ChipSpec {
  key: 'breached' | 'warning' | 'noData' | 'ok' | 'disabled';
  color: 'danger' | 'warning' | 'subdued' | 'success' | 'default';
  label: (n: number) => string;
  count: number;
}

function chipSpecsForBucket(b: SloHealthBucket): ChipSpec[] {
  // `rules_missing` folds into breached (both danger); `stale` folds into
  // noData (both subdued). Keeps the row at exactly five chips for layout
  // stability across refetches.
  return [
    {
      key: 'breached',
      color: 'danger',
      count: b.breached + b.rulesMissing,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.chip.breached', {
          defaultMessage: '{n} breached',
          values: { n },
        }),
    },
    {
      key: 'warning',
      color: 'warning',
      count: b.warning,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.chip.warning', {
          defaultMessage: '{n} warning',
          values: { n },
        }),
    },
    {
      key: 'noData',
      color: 'subdued',
      count: b.noData + b.stale,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.chip.noData', {
          defaultMessage: '{n} no data',
          values: { n },
        }),
    },
    {
      key: 'ok',
      color: 'success',
      count: b.ok,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.chip.ok', {
          defaultMessage: '{n} OK',
          values: { n },
        }),
    },
    {
      key: 'disabled',
      color: 'default',
      count: b.disabled,
      label: (n) =>
        i18n.translate('observability.apm.services.sloHealth.chip.disabled', {
          defaultMessage: '{n} disabled',
          values: { n },
        }),
    },
  ];
}

export const ChipRow: React.FC<{ aggregate: SloHealthBucket }> = ({ aggregate }) => {
  // Hide zero-count chips so color retains its semantic meaning: a gray "0
  // breached" chip reads the same as a gray "33 no data" chip, which collapses
  // a good state into an unknown one. Callers already guard the all-zero case
  // with their own empty-state UI, so rendering nothing here is safe.
  const specs = chipSpecsForBucket(aggregate).filter((spec) => spec.count > 0);
  if (specs.length === 0) {
    return null;
  }
  return (
    <EuiFlexGroup
      gutterSize="m"
      alignItems="center"
      responsive={false}
      role="group"
      aria-label={i18n.translate('observability.apm.services.sloHealth.chipRowAriaLabel', {
        defaultMessage: 'SLO health summary for {n, plural, one {# service} other {# services}}',
        values: { n: aggregate.slos.length || 0 },
      })}
    >
      {specs.map((spec) => (
        <EuiFlexItem key={spec.key} grow={false}>
          <EuiHealth color={spec.color} data-test-subj={`sloHealthPanelChip-${spec.key}`}>
            <span style={TABULAR_NUMS_STYLE}>{spec.label(spec.count)}</span>
          </EuiHealth>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};
