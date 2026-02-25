/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiBadge, EuiLink, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';

/**
 * Represents a filter badge to display
 */
export interface FilterBadge {
  /** Unique key for the badge (category id) */
  key: string;
  /** Display name (e.g., "Environment", "Availability") */
  category: string;
  /** Selected values (will be joined with ", ") */
  values: string[];
  /** Callback when X is clicked - clears ALL values for this category */
  onRemove: () => void;
}

export interface ActiveFilterBadgesProps {
  /** Array of filter badges to display */
  filters: FilterBadge[];
  /** Callback when "Clear all" is clicked */
  onClearAll: () => void;
  /** Whether the badges are disabled */
  disabled?: boolean;
}

/**
 * ActiveFilterBadges - Displays active filters as removable badges
 *
 * Features:
 * - Shows each active filter category as a badge with comma-separated values
 * - Each badge has an X button to clear all values for that category
 * - "Clear all" link button to reset all filters
 * - Only renders when there are active filters
 */
export const ActiveFilterBadges: React.FC<ActiveFilterBadgesProps> = ({
  filters,
  onClearAll,
  disabled = false,
}) => {
  // Don't render if no filters are active
  if (filters.length === 0) {
    return null;
  }

  return (
    <EuiFlexGroup
      gutterSize="s"
      alignItems="center"
      wrap
      responsive={false}
      data-test-subj="activeFilterBadges"
    >
      {/* Filter badges */}
      {filters.map((filter) => (
        <EuiFlexItem grow={false} key={filter.key}>
          <EuiBadge
            color="hollow"
            iconType="cross"
            iconSide="right"
            iconOnClick={disabled ? undefined : filter.onRemove}
            iconOnClickAriaLabel={i18n.translate(
              'observability.apm.filterBadges.removeFilterAriaLabel',
              {
                defaultMessage: 'Remove {category} filter',
                values: { category: filter.category },
              }
            )}
            data-test-subj={`filterBadge-${filter.key}`}
          >
            {filter.category}: {filter.values.join(', ')}
          </EuiBadge>
        </EuiFlexItem>
      ))}

      {/* Clear all link */}
      <EuiFlexItem grow={false}>
        <EuiLink
          onClick={disabled ? undefined : onClearAll}
          color="primary"
          disabled={disabled}
          data-test-subj="clearAllFiltersLink"
        >
          <EuiText size="xs">
            {i18n.translate('observability.apm.filterBadges.clearAll', {
              defaultMessage: 'Clear all',
            })}
          </EuiText>
        </EuiLink>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
