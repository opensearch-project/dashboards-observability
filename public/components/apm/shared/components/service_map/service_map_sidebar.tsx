/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButtonIcon,
  EuiHorizontalRule,
  EuiAccordion,
  EuiSpacer,
  EuiComboBox,
  EuiCheckboxGroup,
  EuiFieldSearch,
  EuiLink,
  EuiLoadingSpinner,
} from '@elastic/eui';
import { FailureRateThresholdFilter, ErrorRateThreshold } from '../filters';
import { ApplicationMapFilters } from '../../../common/types/service_map_types';
import { getEnvironmentDisplayName, APM_CONSTANTS } from '../../../common/constants';
import { applicationMapI18nTexts as i18nTexts } from '../../../pages/application_map/application_map_i18n';
import { TruncatedLabel } from '../../../../common/truncated_label';
import '../../styles/apm_common.scss';

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
 * ServiceMapSidebar - Filter sidebar for the Topology Map
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
  const [environmentSearchQuery, setEnvironmentSearchQuery] = useState('');
  const [environmentExpanded, setEnvironmentExpanded] = useState(false);

  // Sync local state when filter prop changes (e.g., from badge removal)
  useEffect(() => {
    setLocalGroupBy(filters.groupBy || '');
  }, [filters.groupBy]);

  // Build group by options from available attributes (EuiComboBox format)
  const groupByOptions = useMemo(() => {
    return Object.keys(availableGroupByAttributes).map((attrPath) => ({
      label: attrPath,
    }));
  }, [availableGroupByAttributes]);

  // Environments narrowed by the per-filter search box (matches the display name).
  const filteredEnvironments = useMemo(() => {
    if (!environmentSearchQuery) return availableEnvironments;
    const searchLower = environmentSearchQuery.toLowerCase();
    return availableEnvironments.filter((env) =>
      getEnvironmentDisplayName(env).toLowerCase().includes(searchLower)
    );
  }, [availableEnvironments, environmentSearchQuery]);

  // Environment selection map for checkbox group
  const environmentSelectionMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    filters.environments.forEach((env) => {
      map[env] = true;
    });
    return map;
  }, [filters.environments]);

  // Handle group by change (EuiComboBox passes selected options array)
  const handleGroupByChange = useCallback(
    (selectedOptions: Array<{ label: string }>) => {
      const newValue = selectedOptions.length > 0 ? selectedOptions[0].label : '';
      setLocalGroupBy(newValue);
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

  // Merge the currently-filtered environments into the existing selection so
  // values selected under a previous search term survive.
  const handleSelectAllEnvironments = useCallback(() => {
    onFiltersChange({
      ...filters,
      environments: Array.from(new Set([...filters.environments, ...filteredEnvironments])),
    });
  }, [filters, filteredEnvironments, onFiltersChange]);

  const handleClearAllEnvironments = useCallback(() => {
    onFiltersChange({
      ...filters,
      environments: [],
    });
  }, [filters, onFiltersChange]);

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
        <EuiComboBox
          singleSelection={{ asPlainText: true }}
          options={groupByOptions}
          selectedOptions={localGroupBy ? [{ label: localGroupBy }] : []}
          onChange={handleGroupByChange}
          placeholder={i18nTexts.filters.noGrouping}
          compressed
          fullWidth
          isDisabled={isLoading}
          isClearable
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

        {isLoading && availableEnvironments.length === 0 ? (
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="m" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s" color="subdued">
                {i18nTexts.filters.loadingEnvironments}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : availableEnvironments.length > 0 ? (
          <>
            {/* Search box */}
            <EuiFieldSearch
              placeholder=""
              value={environmentSearchQuery}
              onChange={(e) => setEnvironmentSearchQuery(e.target.value)}
              isClearable
              fullWidth
              compressed
              data-test-subj="environmentSearch"
            />

            <EuiSpacer size="s" />

            {/* Select all / Clear all links */}
            {filteredEnvironments.length > 0 && (
              <>
                <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
                  <EuiFlexItem grow={false}>
                    <EuiLink
                      onClick={handleSelectAllEnvironments}
                      data-test-subj="environmentSelectAll"
                      color="primary"
                    >
                      <EuiText size="xs">{i18nTexts.filters.selectAll}</EuiText>
                    </EuiLink>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiLink
                      onClick={handleClearAllEnvironments}
                      data-test-subj="environmentClearAll"
                      color="primary"
                    >
                      <EuiText size="xs">{i18nTexts.filters.clearAll}</EuiText>
                    </EuiLink>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="s" />
              </>
            )}

            {/* Checkbox list */}
            {filteredEnvironments.length > 0 ? (
              <>
                <div
                  style={
                    environmentExpanded
                      ? {
                          maxBlockSize: APM_CONSTANTS.FILTER_VALUES_EXPANDED_MAX_HEIGHT,
                          overflowY: 'auto',
                        }
                      : undefined
                  }
                >
                  <EuiCheckboxGroup
                    className="apmFilterCheckboxGroup"
                    options={(environmentExpanded
                      ? filteredEnvironments
                      : filteredEnvironments.slice(0, APM_CONSTANTS.ATTRIBUTE_VALUES_INITIAL_LIMIT)
                    ).map((env) => ({
                      id: env,
                      label: <TruncatedLabel text={getEnvironmentDisplayName(env)} />,
                    }))}
                    idToSelectedMap={environmentSelectionMap}
                    onChange={handleEnvironmentChange}
                    compressed
                    data-test-subj="environmentCheckboxGroup"
                  />
                </div>
                {/* Show more / Show less link */}
                {filteredEnvironments.length > APM_CONSTANTS.ATTRIBUTE_VALUES_INITIAL_LIMIT && (
                  <>
                    <EuiSpacer size="xs" />
                    <EuiLink
                      onClick={() => setEnvironmentExpanded((prev) => !prev)}
                      data-test-subj="environmentShowMore"
                    >
                      <EuiText size="xs">
                        {environmentExpanded
                          ? i18nTexts.filters.showLess
                          : i18nTexts.filters.showMore(
                              filteredEnvironments.length -
                                APM_CONSTANTS.ATTRIBUTE_VALUES_INITIAL_LIMIT
                            )}
                      </EuiText>
                    </EuiLink>
                  </>
                )}
              </>
            ) : (
              <EuiText size="s" color="subdued">
                {i18nTexts.filters.noMatchingValues}
              </EuiText>
            )}
          </>
        ) : (
          <EuiText size="s" color="subdued">
            {i18nTexts.filters.noEnvironments}
          </EuiText>
        )}
      </EuiAccordion>
    </EuiPanel>
  );
};
