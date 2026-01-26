/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButtonIcon,
  EuiHorizontalRule,
  EuiAccordion,
  EuiSpacer,
  EuiSuperSelect,
  EuiCheckboxGroup,
} from '@elastic/eui';
import { FailureRateThresholdFilter, ErrorRateThreshold } from '../filters';
import { ApplicationMapFilters } from '../../../common/types/service_map_types';
import { getEnvironmentDisplayName } from '../../../common/constants';
import { applicationMapI18nTexts as i18nTexts } from '../../../pages/application_map/application_map_i18n';

export interface ServiceMapSidebarProps {
  filters: ApplicationMapFilters;
  onFiltersChange: (filters: ApplicationMapFilters) => void;
  availableGroupByAttributes: Record<string, string[]>;
  /** Available environments extracted from service map nodes (raw environment strings) */
  availableEnvironments: string[];
  isLoading: boolean;
  onToggle: () => void;
}

/**
 * ServiceMapSidebar - Filter sidebar for the Application Map
 *
 * Contains:
 * - Group By dropdown (populated from availableGroupByAttributes)
 * - Error/Fault Rate threshold filter
 * - Environment filter (dynamically built from available environments)
 */
export const ServiceMapSidebar: React.FC<ServiceMapSidebarProps> = ({
  filters,
  onFiltersChange,
  availableGroupByAttributes,
  availableEnvironments,
  isLoading,
  onToggle,
}) => {
  // Local state for groupBy select - syncs with filter prop but gives us control
  const [localGroupBy, setLocalGroupBy] = useState<string>(filters.groupBy || '');
  // Ref for guard check (always has latest value, avoids stale closure)
  const localGroupByRef = useRef<string>(localGroupBy);

  // Sync local state when filter prop changes (e.g., from badge removal)
  useEffect(() => {
    setLocalGroupBy(filters.groupBy || '');
    localGroupByRef.current = filters.groupBy || '';
  }, [filters.groupBy]);

  // Build group by options from available attributes (EuiSuperSelect format)
  const groupByOptions = useMemo(() => {
    const options = [{ value: '', inputDisplay: i18nTexts.filters.noGrouping }];

    Object.keys(availableGroupByAttributes).forEach((attrPath) => {
      options.push({ value: attrPath, inputDisplay: attrPath });
    });

    return options;
  }, [availableGroupByAttributes]);

  // Environment checkbox options - dynamically built from available environments
  const environmentCheckboxes = useMemo(() => {
    return availableEnvironments.map((env) => ({
      id: env,
      label: getEnvironmentDisplayName(env),
    }));
  }, [availableEnvironments]);

  // Environment selection map for checkbox group
  const environmentSelectionMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    filters.environments.forEach((env) => {
      map[env] = true;
    });
    return map;
  }, [filters.environments]);

  // Handle group by change (EuiSuperSelect passes value directly, not event)
  const handleGroupByChange = useCallback(
    (newValue: string) => {
      // Guard: Ignore spurious empty onChange when a value is already selected.
      // Use ref to always get the latest value (avoids stale closure issues).
      if (newValue === '' && localGroupByRef.current !== '') {
        return;
      }
      // Update ref and state immediately
      localGroupByRef.current = newValue;
      setLocalGroupBy(newValue);
      // Propagate to parent
      onFiltersChange({
        ...filters,
        groupBy: newValue || null,
      });
    },
    [filters, onFiltersChange]
  );

  // Handle fault rate (5xx) threshold change
  const handleFaultRateChange = useCallback(
    (thresholds: ErrorRateThreshold[]) => {
      onFiltersChange({
        ...filters,
        faultRateThresholds: thresholds,
      });
    },
    [filters, onFiltersChange]
  );

  // Handle error rate (4xx) threshold change
  const handleErrorRateChange = useCallback(
    (thresholds: ErrorRateThreshold[]) => {
      onFiltersChange({
        ...filters,
        errorRateThresholds: thresholds,
      });
    },
    [filters, onFiltersChange]
  );

  // Handle environment filter change
  const handleEnvironmentChange = useCallback(
    (environmentId: string) => {
      const newEnvironments = filters.environments.includes(environmentId)
        ? filters.environments.filter((e) => e !== environmentId)
        : [...filters.environments, environmentId];

      onFiltersChange({
        ...filters,
        environments: newEnvironments,
      });
    },
    [filters, onFiltersChange]
  );

  return (
    <EuiPanel style={{ height: '100%' }}>
      {/* Header */}
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <strong>{i18nTexts.filters.title}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            color="text"
            aria-label={i18nTexts.filters.toggleAriaLabel}
            iconType="menuLeft"
            onClick={onToggle}
            data-test-subj="service-map-sidebar-toggle"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule margin="xs" />

      {/* Group By Filter */}
      <EuiAccordion
        id="groupByAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>{i18nTexts.filters.groupBy}</strong>
          </EuiText>
        }
        initialIsOpen={true}
        data-test-subj="groupByAccordion"
      >
        <EuiSpacer size="xs" />
        <EuiSuperSelect
          options={groupByOptions}
          valueOfSelected={localGroupBy}
          onChange={handleGroupByChange}
          compressed
          fullWidth
          disabled={isLoading}
          data-test-subj="groupBySelect"
        />
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Fault Rate (5xx) Filter */}
      <EuiAccordion
        id="faultRateAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>{i18nTexts.filters.faultRate}</strong>
          </EuiText>
        }
        initialIsOpen={true}
        data-test-subj="faultRateAccordion"
      >
        <EuiSpacer size="s" />
        <FailureRateThresholdFilter
          selectedThresholds={filters.faultRateThresholds}
          onSelectionChange={handleFaultRateChange}
          dataTestSubj="faultRateThresholdFilter"
          disabled={isLoading}
          idPrefix="fault-rate"
        />
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Error Rate (4xx) Filter */}
      <EuiAccordion
        id="errorRateAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>{i18nTexts.filters.errorRate}</strong>
          </EuiText>
        }
        initialIsOpen={true}
        data-test-subj="errorRateAccordion"
      >
        <EuiSpacer size="s" />
        <FailureRateThresholdFilter
          selectedThresholds={filters.errorRateThresholds}
          onSelectionChange={handleErrorRateChange}
          dataTestSubj="errorRateThresholdFilter"
          disabled={isLoading}
          idPrefix="error-rate"
        />
      </EuiAccordion>

      <EuiHorizontalRule margin="xs" />

      {/* Environment Filter */}
      <EuiAccordion
        id="environmentAccordion"
        buttonContent={
          <EuiText size="xs">
            <strong>{i18nTexts.filters.environment}</strong>
          </EuiText>
        }
        initialIsOpen={true}
        data-test-subj="environmentAccordion"
      >
        <EuiSpacer size="xs" />
        <EuiCheckboxGroup
          options={environmentCheckboxes}
          idToSelectedMap={environmentSelectionMap}
          onChange={handleEnvironmentChange}
          compressed
          disabled={isLoading}
          data-test-subj="environmentCheckboxGroup"
        />
      </EuiAccordion>
    </EuiPanel>
  );
};
