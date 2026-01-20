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

// Initial item count for checkbox lists (matching services home)
const INITIAL_ITEM_LIMIT = 5;

// Color indicator helper for threshold filters
const getThresholdColor = (threshold: string, type: 'availability' | 'errorRate'): string => {
  if (type === 'availability') {
    if (threshold === '< 95%') return '#BD271E'; // danger
    if (threshold === '95-99%') return '#F5A700'; // warning
    if (threshold === '≥ 99%') return '#017D73'; // success
  } else {
    // For error rates, low is good
    if (threshold === '> 5%') return '#BD271E'; // danger
    if (threshold === '1-5%') return '#F5A700'; // warning
    if (threshold === '< 1%') return '#017D73'; // success
  }
  return '#69707D'; // default subdued gray
};

// Colored label component for threshold checkboxes
const ColoredThresholdLabel: React.FC<{ threshold: string; color: string }> = ({
  threshold,
  color,
}) => (
  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
    <EuiFlexItem grow={false}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: color,
          border: '1px solid rgba(0,0,0,0.1)',
          flexShrink: 0,
        }}
      />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiText size="s">{threshold}</EuiText>
    </EuiFlexItem>
  </EuiFlexGroup>
);

export interface DependencyFilterSidebarProps {
  // Availability threshold filter
  availabilityThresholds: string[];
  selectedAvailabilityThresholds: string[];
  onAvailabilityThresholdsChange: (selected: string[]) => void;

  // Error rate threshold filter
  errorRateThresholds: string[];
  selectedErrorRateThresholds: string[];
  onErrorRateThresholdsChange: (selected: string[]) => void;

  // Dependency name filter
  dependencyNames: string[];
  selectedDependencies: string[];
  onDependencyChange: (selected: string[]) => void;

  // Service operation filter
  serviceOperations: string[];
  selectedServiceOperations: string[];
  onServiceOperationChange: (selected: string[]) => void;

  // Remote operation filter
  remoteOperations: string[];
  selectedRemoteOperations: string[];
  onRemoteOperationChange: (selected: string[]) => void;

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
 * DependencyFilterSidebar - Multi-section filter sidebar for dependencies page
 *
 * Provides a collapsible left sidebar with filter sections:
 * - Availability threshold (checkboxes with color indicators)
 * - Error rate threshold (checkboxes with color indicators)
 * - Dependency name (search + checkboxes)
 * - Service operations (search + checkboxes)
 * - Remote operations (search + checkboxes)
 * - Latency (p99) range slider
 * - Requests range slider
 */
export const DependencyFilterSidebar: React.FC<DependencyFilterSidebarProps> = ({
  availabilityThresholds,
  selectedAvailabilityThresholds,
  onAvailabilityThresholdsChange,
  errorRateThresholds,
  selectedErrorRateThresholds,
  onErrorRateThresholdsChange,
  dependencyNames,
  selectedDependencies,
  onDependencyChange,
  serviceOperations,
  selectedServiceOperations,
  onServiceOperationChange,
  remoteOperations,
  selectedRemoteOperations,
  onRemoteOperationChange,
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
  const [dependencySearch, setDependencySearch] = useState('');
  const [serviceOperationSearch, setServiceOperationSearch] = useState('');
  const [remoteOperationSearch, setRemoteOperationSearch] = useState('');
  const [showAllDependencies, setShowAllDependencies] = useState(false);
  const [showAllServiceOperations, setShowAllServiceOperations] = useState(false);
  const [showAllRemoteOperations, setShowAllRemoteOperations] = useState(false);

  // Availability threshold section
  const availabilityThresholdOptions = useMemo(() => {
    return availabilityThresholds.map((threshold) => ({
      id: `availability-${threshold}`,
      label: (
        <ColoredThresholdLabel
          threshold={threshold}
          color={getThresholdColor(threshold, 'availability')}
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
          color={getThresholdColor(threshold, 'errorRate')}
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

  // Dependency name section
  const filteredDependencies = useMemo(() => {
    if (!dependencySearch) return dependencyNames;
    const searchLower = dependencySearch.toLowerCase();
    return dependencyNames.filter((name) => name.toLowerCase().includes(searchLower));
  }, [dependencyNames, dependencySearch]);

  const remainingDependenciesCount = useMemo(() => {
    return Math.max(0, filteredDependencies.length - INITIAL_ITEM_LIMIT);
  }, [filteredDependencies]);

  const visibleDependencies = useMemo(() => {
    if (showAllDependencies || filteredDependencies.length <= INITIAL_ITEM_LIMIT) {
      return filteredDependencies;
    }
    return filteredDependencies.slice(0, INITIAL_ITEM_LIMIT);
  }, [filteredDependencies, showAllDependencies]);

  const dependencyCheckboxOptions = useMemo(() => {
    return visibleDependencies.map((dep) => ({
      id: dep,
      label: dep,
    }));
  }, [visibleDependencies]);

  const dependencySelectionMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    selectedDependencies.forEach((dep) => {
      map[dep] = true;
    });
    return map;
  }, [selectedDependencies]);

  const handleDependencyChange = useCallback(
    (optionId: string) => {
      const isSelected = selectedDependencies.includes(optionId);
      if (isSelected) {
        onDependencyChange(selectedDependencies.filter((d) => d !== optionId));
      } else {
        onDependencyChange([...selectedDependencies, optionId]);
      }
    },
    [selectedDependencies, onDependencyChange]
  );

  // Service operation section
  const filteredServiceOperations = useMemo(() => {
    if (!serviceOperationSearch) return serviceOperations;
    const searchLower = serviceOperationSearch.toLowerCase();
    return serviceOperations.filter((op) => op.toLowerCase().includes(searchLower));
  }, [serviceOperations, serviceOperationSearch]);

  const remainingServiceOperationsCount = useMemo(() => {
    return Math.max(0, filteredServiceOperations.length - INITIAL_ITEM_LIMIT);
  }, [filteredServiceOperations]);

  const visibleServiceOperations = useMemo(() => {
    if (showAllServiceOperations || filteredServiceOperations.length <= INITIAL_ITEM_LIMIT) {
      return filteredServiceOperations;
    }
    return filteredServiceOperations.slice(0, INITIAL_ITEM_LIMIT);
  }, [filteredServiceOperations, showAllServiceOperations]);

  const serviceOperationCheckboxOptions = useMemo(() => {
    return visibleServiceOperations.map((op) => ({
      id: `svc-op-${op}`,
      label: op,
    }));
  }, [visibleServiceOperations]);

  const serviceOperationSelectionMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    selectedServiceOperations.forEach((op) => {
      map[`svc-op-${op}`] = true;
    });
    return map;
  }, [selectedServiceOperations]);

  const handleServiceOperationChange = useCallback(
    (optionId: string) => {
      const op = optionId.replace('svc-op-', '');
      const isSelected = selectedServiceOperations.includes(op);
      if (isSelected) {
        onServiceOperationChange(selectedServiceOperations.filter((o) => o !== op));
      } else {
        onServiceOperationChange([...selectedServiceOperations, op]);
      }
    },
    [selectedServiceOperations, onServiceOperationChange]
  );

  // Remote operation section
  const filteredRemoteOperations = useMemo(() => {
    if (!remoteOperationSearch) return remoteOperations;
    const searchLower = remoteOperationSearch.toLowerCase();
    return remoteOperations.filter((op) => op.toLowerCase().includes(searchLower));
  }, [remoteOperations, remoteOperationSearch]);

  const remainingRemoteOperationsCount = useMemo(() => {
    return Math.max(0, filteredRemoteOperations.length - INITIAL_ITEM_LIMIT);
  }, [filteredRemoteOperations]);

  const visibleRemoteOperations = useMemo(() => {
    if (showAllRemoteOperations || filteredRemoteOperations.length <= INITIAL_ITEM_LIMIT) {
      return filteredRemoteOperations;
    }
    return filteredRemoteOperations.slice(0, INITIAL_ITEM_LIMIT);
  }, [filteredRemoteOperations, showAllRemoteOperations]);

  const remoteOperationCheckboxOptions = useMemo(() => {
    return visibleRemoteOperations.map((op) => ({
      id: `remote-op-${op}`,
      label: op,
    }));
  }, [visibleRemoteOperations]);

  const remoteOperationSelectionMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    selectedRemoteOperations.forEach((op) => {
      map[`remote-op-${op}`] = true;
    });
    return map;
  }, [selectedRemoteOperations]);

  const handleRemoteOperationChange = useCallback(
    (optionId: string) => {
      const op = optionId.replace('remote-op-', '');
      const isSelected = selectedRemoteOperations.includes(op);
      if (isSelected) {
        onRemoteOperationChange(selectedRemoteOperations.filter((o) => o !== op));
      } else {
        onRemoteOperationChange([...selectedRemoteOperations, op]);
      }
    },
    [selectedRemoteOperations, onRemoteOperationChange]
  );

  // Select/Clear all helpers for checkbox lists
  const handleSelectAllDependencies = useCallback(() => {
    onDependencyChange(filteredDependencies);
  }, [filteredDependencies, onDependencyChange]);

  const handleClearAllDependencies = useCallback(() => {
    onDependencyChange([]);
  }, [onDependencyChange]);

  const handleSelectAllServiceOperations = useCallback(() => {
    onServiceOperationChange(filteredServiceOperations);
  }, [filteredServiceOperations, onServiceOperationChange]);

  const handleClearAllServiceOperations = useCallback(() => {
    onServiceOperationChange([]);
  }, [onServiceOperationChange]);

  const handleSelectAllRemoteOperations = useCallback(() => {
    onRemoteOperationChange(filteredRemoteOperations);
  }, [filteredRemoteOperations, onRemoteOperationChange]);

  const handleClearAllRemoteOperations = useCallback(() => {
    onRemoteOperationChange([]);
  }, [onRemoteOperationChange]);

  // Handle edge cases for range sliders when min === max
  const effectiveLatencyMax = latencyMax === latencyMin ? latencyMin + 1 : latencyMax;
  const effectiveRequestsMax = requestsMax === requestsMin ? requestsMin + 1 : requestsMax;

  // Standalone mode: handle collapsed state
  if (renderMode === 'standalone' && !isOpen) {
    return (
      <EuiPanel paddingSize="s" style={{ width: 40, height: '100%' }}>
        <EuiButtonIcon
          iconType="menuRight"
          onClick={onToggle}
          aria-label="Open filters"
          data-test-subj="dependencyFilterSidebarToggleOpen"
        />
      </EuiPanel>
    );
  }

  // Determine toggle handler based on render mode
  const handleToggle = renderMode === 'embedded' ? onTogglePanel : onToggle;

  // In embedded mode, don't set fixed width (parent resizable container handles sizing)
  const panelStyle =
    renderMode === 'embedded' ? { height: '100%' } : { width: 280, height: '100%' };

  return (
    <EuiPanel style={panelStyle}>
      {/* Header */}
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
            data-test-subj="dependencyFilterSidebarToggleClose"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule margin="xs" />

      {/* Availability Threshold */}
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
          />
        ) : (
          <EuiText size="xs" color="subdued">
            No availability thresholds
          </EuiText>
        )}
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Dependency Name */}
      <EuiAccordion
        id="dependencyNameAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>Dependency service</strong>
          </EuiText>
        }
        initialIsOpen={true}
        data-test-subj="dependencyNameAccordion"
      >
        <EuiSpacer size="xs" />
        <EuiFieldSearch
          placeholder="Search dependencies"
          value={dependencySearch}
          onChange={(e) => setDependencySearch(e.target.value)}
          isClearable
          fullWidth
          compressed
          disabled={disabled}
        />
        <EuiSpacer size="xs" />
        {filteredDependencies.length > 0 && (
          <>
            <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiLink onClick={handleSelectAllDependencies} color="primary" disabled={disabled}>
                  <EuiText size="xs">Select all</EuiText>
                </EuiLink>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiLink onClick={handleClearAllDependencies} color="primary" disabled={disabled}>
                  <EuiText size="xs">Clear all</EuiText>
                </EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
          </>
        )}
        {dependencyCheckboxOptions.length > 0 ? (
          <>
            <EuiCheckboxGroup
              options={dependencyCheckboxOptions}
              idToSelectedMap={dependencySelectionMap}
              onChange={handleDependencyChange}
              compressed
              disabled={disabled}
            />
            {filteredDependencies.length > INITIAL_ITEM_LIMIT && (
              <>
                <EuiSpacer size="xs" />
                <EuiLink
                  onClick={() => setShowAllDependencies(!showAllDependencies)}
                  color="primary"
                  disabled={disabled}
                >
                  <EuiText size="xs">
                    {showAllDependencies ? 'Show less' : `+${remainingDependenciesCount} more`}
                  </EuiText>
                </EuiLink>
              </>
            )}
          </>
        ) : (
          <EuiText size="xs" color="subdued">
            No dependencies found
          </EuiText>
        )}
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Error Rate Threshold */}
      <EuiAccordion
        id="errorRateThresholdAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>Error Rate</strong>
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
          />
        ) : (
          <EuiText size="xs" color="subdued">
            No error rate thresholds
          </EuiText>
        )}
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Latency Filter */}
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
          data-test-subj="latencyRangeSlider"
        />
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued" textAlign="center">
          {latencyRange[0].toFixed(2)}ms - {latencyRange[1].toFixed(2)}ms
        </EuiText>
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Requests Filter */}
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
          step={1}
          value={requestsRange}
          onChange={(value) => onRequestsRangeChange(value as [number, number])}
          showLabels
          compressed
          disabled={disabled || requestsMin === requestsMax}
          data-test-subj="requestsRangeSlider"
        />
        <EuiSpacer size="xs" />
        <EuiText size="xs" color="subdued" textAlign="center">
          {requestsRange[0].toLocaleString()} - {requestsRange[1].toLocaleString()} requests
        </EuiText>
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Service operations */}
      <EuiAccordion
        id="serviceOperationAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>Service operations</strong>
          </EuiText>
        }
        initialIsOpen={false}
        data-test-subj="serviceOperationAccordion"
      >
        <EuiSpacer size="xs" />
        <EuiFieldSearch
          placeholder="Search service operations"
          value={serviceOperationSearch}
          onChange={(e) => setServiceOperationSearch(e.target.value)}
          isClearable
          fullWidth
          compressed
          disabled={disabled}
        />
        <EuiSpacer size="xs" />
        {filteredServiceOperations.length > 0 && (
          <>
            <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={handleSelectAllServiceOperations}
                  color="primary"
                  disabled={disabled}
                >
                  <EuiText size="xs">Select all</EuiText>
                </EuiLink>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={handleClearAllServiceOperations}
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
        {serviceOperationCheckboxOptions.length > 0 ? (
          <>
            <EuiCheckboxGroup
              options={serviceOperationCheckboxOptions}
              idToSelectedMap={serviceOperationSelectionMap}
              onChange={handleServiceOperationChange}
              compressed
              disabled={disabled}
            />
            {filteredServiceOperations.length > INITIAL_ITEM_LIMIT && (
              <>
                <EuiSpacer size="xs" />
                <EuiLink
                  onClick={() => setShowAllServiceOperations(!showAllServiceOperations)}
                  color="primary"
                  disabled={disabled}
                >
                  <EuiText size="xs">
                    {showAllServiceOperations
                      ? 'Show less'
                      : `+${remainingServiceOperationsCount} more`}
                  </EuiText>
                </EuiLink>
              </>
            )}
          </>
        ) : (
          <EuiText size="xs" color="subdued">
            No service operations found
          </EuiText>
        )}
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Remote operations */}
      <EuiAccordion
        id="remoteOperationAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>Remote operations</strong>
          </EuiText>
        }
        initialIsOpen={false}
        data-test-subj="remoteOperationAccordion"
      >
        <EuiSpacer size="xs" />
        <EuiFieldSearch
          placeholder="Search remote operations"
          value={remoteOperationSearch}
          onChange={(e) => setRemoteOperationSearch(e.target.value)}
          isClearable
          fullWidth
          compressed
          disabled={disabled}
        />
        <EuiSpacer size="xs" />
        {filteredRemoteOperations.length > 0 && (
          <>
            <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={handleSelectAllRemoteOperations}
                  color="primary"
                  disabled={disabled}
                >
                  <EuiText size="xs">Select all</EuiText>
                </EuiLink>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiLink
                  onClick={handleClearAllRemoteOperations}
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
        {remoteOperationCheckboxOptions.length > 0 ? (
          <>
            <EuiCheckboxGroup
              options={remoteOperationCheckboxOptions}
              idToSelectedMap={remoteOperationSelectionMap}
              onChange={handleRemoteOperationChange}
              compressed
              disabled={disabled}
            />
            {filteredRemoteOperations.length > INITIAL_ITEM_LIMIT && (
              <>
                <EuiSpacer size="xs" />
                <EuiLink
                  onClick={() => setShowAllRemoteOperations(!showAllRemoteOperations)}
                  color="primary"
                  disabled={disabled}
                >
                  <EuiText size="xs">
                    {showAllRemoteOperations
                      ? 'Show less'
                      : `+${remainingRemoteOperationsCount} more`}
                  </EuiText>
                </EuiLink>
              </>
            )}
          </>
        ) : (
          <EuiText size="xs" color="subdued">
            No remote operations found
          </EuiText>
        )}
      </EuiAccordion>
    </EuiPanel>
  );
};
