/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButtonIcon,
  EuiAccordion,
  EuiFieldSearch,
  EuiSpacer,
  EuiCheckboxGroup,
  EuiLink,
  EuiHorizontalRule,
} from '@elastic/eui';

export interface FilterSidebarProps {
  /**
   * List of all items to show in the filter
   */
  items: string[];

  /**
   * Currently selected items
   */
  selectedItems: string[];

  /**
   * Callback when selection changes
   */
  onSelectionChange: (selectedItems: string[]) => void;

  /**
   * Whether the sidebar is open
   */
  isOpen: boolean;

  /**
   * Callback to toggle sidebar open/closed
   */
  onToggle: () => void;

  /**
   * Title for the filter section (e.g., "Operation name", "Dependency name")
   */
  filterTitle: string;

  /**
   * Placeholder text for search input
   */
  searchPlaceholder?: string;

  /**
   * Number of items to show before "View more" appears
   */
  initialItemCount?: number;
}

/**
 * FilterSidebar - Collapsible sidebar with checkbox filters
 *
 * Provides a collapsible left sidebar for filtering table data with:
 * - Search box to filter the checkbox list
 * - Checkbox group with all/none selection
 * - "View more/less" for long lists
 * - Collapsible to save screen space
 *
 * Usage:
 * ```tsx
 * <FilterSidebar
 *   items={operationNames}
 *   selectedItems={selectedOperations}
 *   onSelectionChange={setSelectedOperations}
 *   isOpen={isSidebarOpen}
 *   onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
 *   filterTitle="Operation name"
 *   searchPlaceholder="Search operations"
 * />
 * ```
 */
export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  items,
  selectedItems,
  onSelectionChange,
  isOpen,
  onToggle,
  filterTitle,
  searchPlaceholder = 'Search...',
  initialItemCount = 10,
}) => {
  const [searchText, setSearchText] = useState('');
  const [showAll, setShowAll] = useState(false);

  // Filter items based on search text
  const filteredItems = useMemo(() => {
    if (!searchText) return items;
    const searchLower = searchText.toLowerCase();
    return items.filter((item) => item.toLowerCase().includes(searchLower));
  }, [items, searchText]);

  // Limit visible items based on showAll state
  const visibleItems = useMemo(() => {
    if (showAll || filteredItems.length <= initialItemCount) {
      return filteredItems;
    }
    return filteredItems.slice(0, initialItemCount);
  }, [filteredItems, showAll, initialItemCount]);

  // Create checkbox options from visible items
  const checkboxOptions = useMemo(() => {
    return visibleItems.map((item) => ({
      id: item,
      label: item,
    }));
  }, [visibleItems]);

  // Create selection map for EuiCheckboxGroup
  const idToSelectedMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    selectedItems.forEach((item) => {
      map[item] = true;
    });
    return map;
  }, [selectedItems]);

  // Handle checkbox selection change
  const handleCheckboxChange = useCallback(
    (optionId: string) => {
      const isCurrentlySelected = selectedItems.includes(optionId);
      if (isCurrentlySelected) {
        // Remove from selection
        onSelectionChange(selectedItems.filter((item) => item !== optionId));
      } else {
        // Add to selection
        onSelectionChange([...selectedItems, optionId]);
      }
    },
    [selectedItems, onSelectionChange]
  );

  // Handle select all
  const handleSelectAll = useCallback(() => {
    onSelectionChange(filteredItems);
  }, [filteredItems, onSelectionChange]);

  // Handle clear all
  const handleClearAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  if (!isOpen) {
    // Collapsed state - show toggle button only
    return (
      <EuiPanel paddingSize="s" hasShadow={false} hasBorder style={{ width: 40 }}>
        <EuiButtonIcon
          iconType="menuRight"
          onClick={onToggle}
          aria-label="Open filters"
          data-test-subj="filterSidebarToggleOpen"
        />
      </EuiPanel>
    );
  }

  // Expanded state - show full sidebar
  return (
    <EuiPanel paddingSize="m" hasShadow={false} hasBorder style={{ width: 280 }}>
      {/* Header with close button */}
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="none">
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>Filters</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            iconType="menuLeft"
            onClick={onToggle}
            aria-label="Close filters"
            data-test-subj="filterSidebarToggleClose"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />
      <EuiHorizontalRule margin="none" />
      <EuiSpacer size="m" />

      {/* Filter section */}
      <EuiAccordion
        id="filterSidebarAccordion"
        buttonContent={
          <EuiText size="s">
            <strong>{filterTitle}</strong>
          </EuiText>
        }
        initialIsOpen={true}
        data-test-subj="filterSidebarAccordion"
      >
        <EuiSpacer size="s" />

        {/* Search box */}
        <EuiFieldSearch
          placeholder={searchPlaceholder}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          isClearable
          fullWidth
          compressed
          data-test-subj="filterSidebarSearch"
        />

        <EuiSpacer size="s" />

        {/* Select all / Clear all links */}
        {filteredItems.length > 0 && (
          <>
            <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={handleSelectAll}
                  data-test-subj="filterSidebarSelectAll"
                  color="primary"
                >
                  <EuiText size="xs">Select all</EuiText>
                </EuiLink>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={handleClearAll}
                  data-test-subj="filterSidebarClearAll"
                  color="primary"
                >
                  <EuiText size="xs">Clear all</EuiText>
                </EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
          </>
        )}

        {/* Checkbox list */}
        {checkboxOptions.length > 0 ? (
          <>
            <EuiCheckboxGroup
              options={checkboxOptions}
              idToSelectedMap={idToSelectedMap}
              onChange={handleCheckboxChange}
              compressed
              data-test-subj="filterSidebarCheckboxGroup"
            />

            {/* View more/less link */}
            {filteredItems.length > initialItemCount && (
              <>
                <EuiSpacer size="s" />
                <EuiLink
                  onClick={() => setShowAll(!showAll)}
                  data-test-subj="filterSidebarViewMore"
                  color="primary"
                >
                  <EuiText size="xs">{showAll ? 'View less' : 'View more'}</EuiText>
                </EuiLink>
              </>
            )}
          </>
        ) : (
          <EuiText size="s" color="subdued">
            No items found
          </EuiText>
        )}
      </EuiAccordion>
    </EuiPanel>
  );
};
