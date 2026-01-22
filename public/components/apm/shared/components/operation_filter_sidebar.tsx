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
  EuiDualRange,
} from '@elastic/eui';
import { ColoredThresholdLabel, getThemeAwareThresholdColor } from './filters';

// Initial item limit for checkbox lists (matching services home)
const INITIAL_ITEM_LIMIT = 5;

export interface OperationFilterSidebarProps {
  // Availability threshold filter
  availabilityThresholds: string[];
  selectedAvailabilityThresholds: string[];
  onAvailabilityThresholdsChange: (selected: string[]) => void;

  // Error rate threshold filter
  errorRateThresholds: string[];
  selectedErrorRateThresholds: string[];
  onErrorRateThresholdsChange: (selected: string[]) => void;

  // Operation name filter
  operationNames: string[];
  selectedOperations: string[];
  onOperationChange: (selected: string[]) => void;

  // Latency range filter
  latencyRange: [number, number];
  onLatencyRangeChange: (range: [number, number]) => void;
  latencyMin: number;
  latencyMax: number;

  // Requests range filter
  requestsRange: [number, number];
  onRequestsRangeChange: (range: [number, number]) => void;
  requestsMin: number;
  requestsMax: number;

  // Sidebar state (only used in standalone mode)
  isOpen?: boolean;
  onToggle?: () => void;

  // Render mode: 'standalone' for fixed width with toggle, 'embedded' for use in resizable container
  renderMode?: 'standalone' | 'embedded';
  onTogglePanel?: () => void; // For embedded mode toggle

  // Disabled state for loading
  disabled?: boolean;
}

/**
 * OperationFilterSidebar - Multi-section filter sidebar for operations page
 *
 * Provides a collapsible left sidebar with filter sections:
 * - Availability threshold (checkboxes with color indicators)
 * - Error rate threshold (checkboxes with color indicators)
 * - Operation name (search + checkboxes)
 * - Latency (p99) range slider
 * - Requests range slider
 */
export const OperationFilterSidebar: React.FC<OperationFilterSidebarProps> = ({
  availabilityThresholds,
  selectedAvailabilityThresholds,
  onAvailabilityThresholdsChange,
  errorRateThresholds,
  selectedErrorRateThresholds,
  onErrorRateThresholdsChange,
  operationNames,
  selectedOperations,
  onOperationChange,
  latencyRange,
  onLatencyRangeChange,
  latencyMin,
  latencyMax,
  requestsRange,
  onRequestsRangeChange,
  requestsMin,
  requestsMax,
  isOpen = true,
  onToggle,
  renderMode = 'standalone',
  onTogglePanel,
  disabled = false,
}) => {
  const [operationSearch, setOperationSearch] = useState('');
  const [showAllOperations, setShowAllOperations] = useState(false);

  // Availability threshold section
  const availabilityThresholdOptions = useMemo(() => {
    return availabilityThresholds.map((threshold) => ({
      id: `availability-${threshold}`,
      label: (
        <ColoredThresholdLabel
          threshold={threshold}
          color={getThemeAwareThresholdColor(threshold, 'availability')}
        />
      ),
    }));
  }, [availabilityThresholds]);

  const availabilityThresholdSelectionMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    selectedAvailabilityThresholds.forEach((threshold) => {
      map[`availability-${threshold}`] = true;
    });
    return map;
  }, [selectedAvailabilityThresholds]);

  const handleAvailabilityThresholdChange = useCallback(
    (optionId: string) => {
      const threshold = optionId.replace('availability-', '');
      const isSelected = selectedAvailabilityThresholds.includes(threshold);
      if (isSelected) {
        onAvailabilityThresholdsChange(
          selectedAvailabilityThresholds.filter((t) => t !== threshold)
        );
      } else {
        onAvailabilityThresholdsChange([...selectedAvailabilityThresholds, threshold]);
      }
    },
    [selectedAvailabilityThresholds, onAvailabilityThresholdsChange]
  );

  // Error rate threshold section
  const errorRateThresholdOptions = useMemo(() => {
    return errorRateThresholds.map((threshold) => ({
      id: `error-rate-${threshold}`,
      label: (
        <ColoredThresholdLabel
          threshold={threshold}
          color={getThemeAwareThresholdColor(threshold, 'errorRate')}
        />
      ),
    }));
  }, [errorRateThresholds]);

  const errorRateThresholdSelectionMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    selectedErrorRateThresholds.forEach((threshold) => {
      map[`error-rate-${threshold}`] = true;
    });
    return map;
  }, [selectedErrorRateThresholds]);

  const handleErrorRateThresholdChange = useCallback(
    (optionId: string) => {
      const threshold = optionId.replace('error-rate-', '');
      const isSelected = selectedErrorRateThresholds.includes(threshold);
      if (isSelected) {
        onErrorRateThresholdsChange(selectedErrorRateThresholds.filter((t) => t !== threshold));
      } else {
        onErrorRateThresholdsChange([...selectedErrorRateThresholds, threshold]);
      }
    },
    [selectedErrorRateThresholds, onErrorRateThresholdsChange]
  );

  // Operation name section
  const filteredOperations = useMemo(() => {
    if (!operationSearch) return operationNames;
    const searchLower = operationSearch.toLowerCase();
    return operationNames.filter((name) => name.toLowerCase().includes(searchLower));
  }, [operationNames, operationSearch]);

  const visibleOperations = useMemo(() => {
    if (showAllOperations || filteredOperations.length <= INITIAL_ITEM_LIMIT) {
      return filteredOperations;
    }
    return filteredOperations.slice(0, INITIAL_ITEM_LIMIT);
  }, [filteredOperations, showAllOperations]);

  const remainingOperationsCount = filteredOperations.length - INITIAL_ITEM_LIMIT;

  const operationCheckboxOptions = useMemo(() => {
    return visibleOperations.map((op) => ({
      id: op,
      label: op,
    }));
  }, [visibleOperations]);

  const operationSelectionMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    selectedOperations.forEach((op) => {
      map[op] = true;
    });
    return map;
  }, [selectedOperations]);

  const handleOperationChange = useCallback(
    (optionId: string) => {
      const isSelected = selectedOperations.includes(optionId);
      if (isSelected) {
        onOperationChange(selectedOperations.filter((o) => o !== optionId));
      } else {
        onOperationChange([...selectedOperations, optionId]);
      }
    },
    [selectedOperations, onOperationChange]
  );

  // Helper functions for select/clear all operations
  const handleSelectAllOperations = useCallback(() => {
    onOperationChange(filteredOperations);
  }, [filteredOperations, onOperationChange]);

  const handleClearAllOperations = useCallback(() => {
    onOperationChange([]);
  }, [onOperationChange]);

  // Handle edge cases for range filters
  const effectiveLatencyMax = latencyMin === latencyMax ? latencyMax + 1 : latencyMax;
  const effectiveRequestsMax = requestsMin === requestsMax ? requestsMax + 1 : requestsMax;

  // Standalone mode: handle collapsed state
  if (renderMode === 'standalone' && !isOpen) {
    // Collapsed state - show toggle button only
    return (
      <EuiPanel paddingSize="s" style={{ width: 40, height: '100%' }}>
        <EuiButtonIcon
          iconType="menuRight"
          onClick={onToggle}
          aria-label="Open filters"
          data-test-subj="operationFilterSidebarToggleOpen"
        />
      </EuiPanel>
    );
  }

  // Determine toggle handler based on render mode
  const handleToggle = renderMode === 'embedded' ? onTogglePanel : onToggle;

  // Expanded state - show full sidebar with multiple sections
  // In embedded mode, don't set fixed width (parent resizable container handles sizing)
  const panelStyle =
    renderMode === 'embedded' ? { height: '100%' } : { width: 280, height: '100%' };

  return (
    <EuiPanel style={panelStyle}>
      {/* Header with close button */}
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="none">
        <EuiFlexItem grow={false}>
          <strong>Filters</strong>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            color="text"
            iconType="menuLeft"
            onClick={handleToggle}
            aria-label="Close filters"
            data-test-subj="operationFilterSidebarToggleClose"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule margin="xs" />

      {/* Section 1: Availability Threshold */}
      <EuiAccordion
        id="availabilityThresholdAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>Availability</strong>
          </EuiText>
        }
        initialIsOpen={true}
        data-test-subj="availabilityThresholdAccordion"
      >
        <EuiSpacer size="xs" />
        {availabilityThresholdOptions.length > 0 ? (
          <EuiCheckboxGroup
            options={availabilityThresholdOptions}
            idToSelectedMap={availabilityThresholdSelectionMap}
            onChange={handleAvailabilityThresholdChange}
            compressed
            disabled={disabled}
            data-test-subj="availabilityThresholdCheckboxGroup"
          />
        ) : (
          <EuiText size="xs" color="subdued">
            No availability thresholds
          </EuiText>
        )}
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Section 2: Operation Name */}
      <EuiAccordion
        id="operationNameAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>Operations</strong>
          </EuiText>
        }
        initialIsOpen={true}
        data-test-subj="operationNameAccordion"
      >
        <EuiSpacer size="xs" />

        {/* Search box */}
        <EuiFieldSearch
          placeholder=""
          value={operationSearch}
          onChange={(e) => setOperationSearch(e.target.value)}
          isClearable
          fullWidth
          compressed
          disabled={disabled}
          data-test-subj="operationNameSearch"
        />

        <EuiSpacer size="xs" />

        {/* Select all / Clear all links */}
        {filteredOperations.length > 0 && (
          <>
            <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={handleSelectAllOperations}
                  data-test-subj="operationSelectAll"
                  color="primary"
                  disabled={disabled}
                >
                  <EuiText size="xs">Select all</EuiText>
                </EuiLink>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={handleClearAllOperations}
                  data-test-subj="operationClearAll"
                  color="primary"
                  disabled={disabled}
                >
                  <EuiText size="xs">Clear all</EuiText>
                </EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
          </>
        )}

        {/* Checkbox list */}
        {operationCheckboxOptions.length > 0 ? (
          <>
            <EuiCheckboxGroup
              options={operationCheckboxOptions}
              idToSelectedMap={operationSelectionMap}
              onChange={handleOperationChange}
              compressed
              disabled={disabled}
              data-test-subj="operationNameCheckboxGroup"
            />

            {/* Show more/less link */}
            {filteredOperations.length > INITIAL_ITEM_LIMIT && (
              <>
                <EuiSpacer size="xs" />
                <EuiLink
                  onClick={() => setShowAllOperations(!showAllOperations)}
                  data-test-subj="operationViewMore"
                  color="primary"
                  disabled={disabled}
                >
                  <EuiText size="xs">
                    {showAllOperations ? 'Show less' : `+${remainingOperationsCount} more`}
                  </EuiText>
                </EuiLink>
              </>
            )}
          </>
        ) : (
          <EuiText size="xs" color="subdued">
            No operations found
          </EuiText>
        )}
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Section 3: Error rate threshold */}
      <EuiAccordion
        id="errorRateThresholdAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>Error rate</strong>
          </EuiText>
        }
        initialIsOpen={true}
        data-test-subj="errorRateThresholdAccordion"
      >
        <EuiSpacer size="xs" />
        {errorRateThresholdOptions.length > 0 ? (
          <EuiCheckboxGroup
            options={errorRateThresholdOptions}
            idToSelectedMap={errorRateThresholdSelectionMap}
            onChange={handleErrorRateThresholdChange}
            compressed
            disabled={disabled}
            data-test-subj="errorRateThresholdCheckboxGroup"
          />
        ) : (
          <EuiText size="xs" color="subdued">
            No error rate thresholds
          </EuiText>
        )}
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Section 4: Latency Filter */}
      <EuiAccordion
        id="latencyAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>Latency</strong>
          </EuiText>
        }
        initialIsOpen={false}
        data-test-subj="latencyAccordion"
      >
        <EuiSpacer size="xs" />
        <EuiDualRange
          min={latencyMin}
          max={effectiveLatencyMax}
          step={0.05}
          value={latencyRange}
          onChange={(value) => onLatencyRangeChange(value as [number, number])}
          showLabels
          compressed
          disabled={disabled || latencyMin === latencyMax}
          aria-label="Latency range filter"
          data-test-subj="latencyRangeSlider"
        />
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued" textAlign="center">
          {latencyRange[0].toFixed(2)}ms - {latencyRange[1].toFixed(2)}ms
        </EuiText>
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Section 5: Requests Filter */}
      <EuiAccordion
        id="requestsAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>Requests</strong>
          </EuiText>
        }
        initialIsOpen={false}
        data-test-subj="requestsAccordion"
      >
        <EuiSpacer size="xs" />
        <EuiDualRange
          min={requestsMin}
          max={effectiveRequestsMax}
          step={0.05}
          value={requestsRange}
          onChange={(value) => onRequestsRangeChange(value as [number, number])}
          showLabels
          compressed
          disabled={disabled || requestsMin === requestsMax}
          aria-label="Requests range filter"
          data-test-subj="requestsRangeSlider"
        />
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued" textAlign="center">
          {requestsRange[0].toFixed(0)} - {requestsRange[1].toFixed(0)} requests
        </EuiText>
      </EuiAccordion>
    </EuiPanel>
  );
};
