/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiFieldSearch } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TimeRangePicker } from './time_filter';
import { TimeRange } from '../../types/service_types';

const searchPlaceholder = i18n.translate('observability.apm.services.search.placeholder', {
  defaultMessage: 'Filter by service name or environment',
});

export interface ApmPageHeaderProps {
  timeRange: TimeRange;
  onTimeChange: (timeRange: TimeRange) => void;
  onRefresh: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

/**
 * ApmPageHeader - Shared header component for all APM pages
 *
 * Renders search bar and time range picker below the page header.
 * Search bar filters services by name or environment (client-side).
 */
export const ApmPageHeader: React.FC<ApmPageHeaderProps> = ({
  timeRange,
  onTimeChange,
  onRefresh,
  searchQuery = '',
  onSearchChange,
}) => {
  return (
    <EuiFlexGroup alignItems="center" gutterSize="m">
      {/* Search bar on the left - takes available space */}
      <EuiFlexItem grow={true}>
        <EuiFieldSearch
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          isClearable
          fullWidth
          compressed
          data-test-subj="servicesSearchBar"
        />
      </EuiFlexItem>

      {/* Time range picker on the right */}
      <EuiFlexItem grow={false}>
        <TimeRangePicker
          timeRange={timeRange}
          onChange={onTimeChange}
          onRefresh={onRefresh}
          compressed
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
