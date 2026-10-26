/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EuiSuperDatePicker, OnTimeChangeProps, OnRefreshProps } from '@elastic/eui';
import { TimeRange } from '../../../common/types/service_types';

export interface TimeRangePickerProps {
  timeRange: TimeRange;
  onChange: (timeRange: TimeRange) => void;
  onRefresh?: () => void;
  isDisabled?: boolean;
  showRefreshButton?: boolean;
  compressed?: boolean;
}

/**
 * Time range picker component wrapping EuiSuperDatePicker
 *
 * Provides a standardized time range selector for APM pages
 * with support for relative and absolute time ranges, plus a refresh button.
 */
export const TimeRangePicker: React.FC<TimeRangePickerProps> = ({
  timeRange,
  onChange,
  onRefresh,
  isDisabled = false,
  showRefreshButton = true,
  compressed = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleTimeChange = ({ start, end }: OnTimeChangeProps) => {
    // Re-picking the current range is a refresh gesture: setting an unchanged
    // range is a no-op (see usePersistentTimeRange), so refresh explicitly to
    // advance `now` and refetch.
    if (start === timeRange.from && end === timeRange.to) {
      refresh();
      return;
    }
    onChange({
      from: start,
      to: end,
    });
  };

  const refresh = () => {
    if (onRefresh) {
      setIsLoading(true);
      // Call refresh callback
      onRefresh();
      // Reset loading state after a short delay
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  const handleRefresh = (_props: OnRefreshProps) => refresh();

  return (
    <EuiSuperDatePicker
      start={timeRange.from}
      end={timeRange.to}
      onTimeChange={handleTimeChange}
      onRefresh={showRefreshButton ? handleRefresh : undefined}
      isLoading={isLoading}
      isDisabled={isDisabled}
      showUpdateButton="iconOnly"
      compressed={compressed}
      data-test-subj="apmTimeRangePicker"
    />
  );
};
