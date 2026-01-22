/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useCallback } from 'react';
import { EuiCheckboxGroup } from '@elastic/eui';
import { ColoredThresholdLabel } from './colored_threshold_label';
import {
  ErrorRateThreshold,
  ERROR_RATE_THRESHOLD_OPTIONS,
  THRESHOLD_LABELS,
  getThemeAwareThresholdColor,
} from './filter_utils';

export interface FailureRateThresholdFilterProps {
  /** Currently selected thresholds */
  selectedThresholds: ErrorRateThreshold[];
  /** Callback when selection changes */
  onSelectionChange: (selected: ErrorRateThreshold[]) => void;
  /** Data test subject prefix */
  dataTestSubj?: string;
  /** Disable the filter */
  disabled?: boolean;
}

/**
 * FailureRateThresholdFilter - Checkbox filter for failure rate thresholds
 *
 * Provides SLO-style threshold options with colored indicators:
 * - < 1% (green) - Healthy
 * - 1-5% (yellow) - Warning
 * - > 5% (red) - Critical
 *
 * Uses OR logic: services matching ANY selected threshold are shown.
 */
export const FailureRateThresholdFilter: React.FC<FailureRateThresholdFilterProps> = ({
  selectedThresholds,
  onSelectionChange,
  dataTestSubj = 'failureRateThresholdFilter',
  disabled = false,
}) => {
  // Build checkbox options with colored labels
  const checkboxOptions = useMemo(() => {
    return ERROR_RATE_THRESHOLD_OPTIONS.map((threshold) => ({
      id: `failure-rate-${threshold}`,
      label: (
        <ColoredThresholdLabel
          threshold={THRESHOLD_LABELS.errorRate[threshold]}
          color={getThemeAwareThresholdColor(threshold, 'errorRate')}
        />
      ),
    }));
  }, []);

  // Build selection map for EuiCheckboxGroup
  const idToSelectedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    selectedThresholds.forEach((threshold) => {
      map[`failure-rate-${threshold}`] = true;
    });
    return map;
  }, [selectedThresholds]);

  // Handle checkbox change
  const handleCheckboxChange = useCallback(
    (optionId: string) => {
      const threshold = optionId.replace('failure-rate-', '') as ErrorRateThreshold;
      const isSelected = selectedThresholds.includes(threshold);
      if (isSelected) {
        onSelectionChange(selectedThresholds.filter((t) => t !== threshold));
      } else {
        onSelectionChange([...selectedThresholds, threshold]);
      }
    },
    [selectedThresholds, onSelectionChange]
  );

  return (
    <EuiCheckboxGroup
      options={checkboxOptions}
      idToSelectedMap={idToSelectedMap}
      onChange={handleCheckboxChange}
      compressed
      disabled={disabled}
      data-test-subj={`${dataTestSubj}-checkboxGroup`}
    />
  );
};
