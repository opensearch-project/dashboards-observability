/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiDualRange, EuiSpacer, EuiText } from '@elastic/eui';

export interface LatencyRangeFilterProps {
  /** Current range selection [min, max] in milliseconds */
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
 * LatencyRangeFilter - Dual range slider for filtering by latency
 *
 * Designed for reuse across Services, Service Details, and Operations pages.
 */
export const LatencyRangeFilter: React.FC<LatencyRangeFilterProps> = ({
  value,
  onChange,
  min,
  max,
  dataTestSubj = 'latencyRangeFilter',
  disabled = false,
}) => {
  // Handle edge case where min === max (no range)
  const effectiveMax = min === max ? max + 1 : max;

  // Format value for display (round to 2 decimal places)
  const formatValue = (val: number) => val.toFixed(2);

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
          aria-label="Latency range filter"
          data-test-subj={dataTestSubj}
        />
      </div>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued" textAlign="center">
        {formatValue(value[0])}ms - {formatValue(value[1])}ms
      </EuiText>
    </>
  );
};
