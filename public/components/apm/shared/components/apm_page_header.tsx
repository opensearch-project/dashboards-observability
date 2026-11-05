/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiFieldSearch } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TimeRangePicker } from './time_filter';
import { TimeRange } from '../../common/types/service_types';

const searchPlaceholder = i18n.translate('observability.apm.services.search.placeholder', {
  defaultMessage: 'Filter by service name or environment',
});

export interface ApmPageHeaderProps {
  timeRange: TimeRange;
  onTimeChange: (timeRange: TimeRange) => void;
  onRefresh: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showSearchBar?: boolean; // default true - set to false to hide search bar
  /** Extra controls before the search bar (e.g. the topology map's service picker). */
  prepend?: React.ReactNode;
  /** Overrides the search bar placeholder (default: "Filter by service name or environment"). */
  searchPlaceholder?: string;
  /** Shows the search bar disabled (e.g. when there is nothing on screen to search). */
  searchDisabled?: boolean;
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
  showSearchBar = true,
  prepend,
  searchPlaceholder: placeholder = searchPlaceholder,
  searchDisabled = false,
}) => {
  return (
    <EuiFlexGroup
      alignItems="center"
      gutterSize="m"
      justifyContent={showSearchBar ? 'flexStart' : 'flexEnd'}
    >
      {prepend && <EuiFlexItem grow={false}>{prepend}</EuiFlexItem>}

      {/* Search bar on the left - takes available space (conditionally rendered) */}
      {showSearchBar && (
        <EuiFlexItem grow={true}>
          <EuiFieldSearch
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            isClearable
            fullWidth
            compressed
            disabled={searchDisabled}
            data-test-subj="servicesSearchBar"
          />
        </EuiFlexItem>
      )}

      {/* Time range picker - positioned at right end when search bar is hidden */}
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
