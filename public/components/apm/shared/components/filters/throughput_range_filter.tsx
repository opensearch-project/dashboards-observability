/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiDualRange, EuiSpacer, EuiText } from '@elastic/eui';
import { formatThroughput } from '../../../common/format_utils';

export interface ThroughputRangeFilterProps {
  /** Current range selection [min, max] */
  value: [number, number];
  /** Callback when range changes */
  onChange: (range: [number, number]) => void;
  /** Minimum possible value (from data) */
  min: number;
  /** Maximum possible value (from data) */
  max: number;
  /** Data test subject prefix */
  dataTestSubj?: string;
  /** Disable the filter */
  disabled?: boolean;
}

/**
 * ThroughputRangeFilter - Dual range slider for filtering by request count
 *
 * Designed for reuse across Services, Service Details, and Operations pages.
 */
export const ThroughputRangeFilter: React.FC<ThroughputRangeFilterProps> = ({
  value,
  onChange,
  min,
  max,
  dataTestSubj = 'throughputRangeFilter',
  disabled = false,
}) => {
  // Handle edge case where min === max (no range)
  const effectiveMax = min === max ? max + 1 : max;

  return (
    <>
      <div className="apm-range-filter">
        <EuiDualRange
          min={min}
          max={effectiveMax}
          step={0.05}
          value={value}
          onChange={(newValue) => onChange(newValue as [number, number])}
          showLabels
          compressed
          disabled={disabled || min === max}
          aria-label="Throughput range filter"
          data-test-subj={dataTestSubj}
        />
      </div>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued" textAlign="center">
        {formatThroughput(value[0])} - {formatThroughput(value[1])}
      </EuiText>
    </>
  );
};
