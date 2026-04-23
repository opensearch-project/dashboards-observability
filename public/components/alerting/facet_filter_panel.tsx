/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * FacetFilterPanel — reusable collapsible facet filter group component.
 * Used by SloListing, AlertsDashboard, and MonitorsTable.
 *
 * Renders a collapsible section with checkboxes for each option,
 * including count badges and optional color indicators.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiText,
  EuiBadge,
  EuiCheckbox,
  EuiHealth,
  EuiFieldSearch,
  EuiSpacer,
} from '@elastic/eui';

// ============================================================================
// Types
// ============================================================================

export interface FacetGroupConfig {
  id: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  counts: Record<string, number>;
  displayMap?: Record<string, string>;
  colorMap?: Record<string, string>;
  /** Enables a case-insensitive search input above the options list. */
  searchable?: boolean;
  /** Override the aria-label for the search input (defaults to `Search ${label}`). */
  searchAriaLabel?: string;
  /** Cap on number of option rows rendered after filtering. */
  maxVisible?: number;
  /** Hard cap on selection: unchecked options are disabled once reached. Checked options remain interactive. */
  maxSelected?: number;
  /**
   * When true, checked options float to the top of the rendered list.
   * Partition preserves each group's relative order from `options` (stable — no sort comparator,
   * just two filters). Applied AFTER search filter, BEFORE maxVisible slice.
   */
  checkedFirst?: boolean;
  /**
   * Fires when the user attempts to add an option while `maxSelected` is already reached.
   * When provided, the inline "Maximum N ..." helper text is suppressed — the consumer
   * is expected to surface the feedback another way (e.g., a toast with a link to settings).
   */
  onCapReached?: () => void;
}

export interface FacetFilterGroupProps extends FacetGroupConfig {
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
}

// ============================================================================
// FacetFilterGroup — a single collapsible facet section
// ============================================================================

export const FacetFilterGroup: React.FC<FacetFilterGroupProps> = ({
  id,
  label,
  options,
  selected,
  onChange,
  counts,
  displayMap,
  colorMap,
  searchable,
  searchAriaLabel,
  maxVisible,
  maxSelected,
  checkedFirst,
  onCapReached,
  isCollapsed,
  onToggleCollapse,
}) => {
  const activeCount = selected.length;
  const [searchTerm, setSearchTerm] = useState('');

  // Apply case-insensitive search filter against the display label.
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm.trim()) return options;
    const q = searchTerm.trim().toLowerCase();
    return options.filter((opt) => {
      const display = displayMap?.[opt] || opt;
      return display.toLowerCase().includes(q);
    });
  }, [options, displayMap, searchable, searchTerm]);

  // Partition: checked options float to top while preserving their original
  // order (stable — two filters, not a comparator sort, to avoid jumpy UX
  // on every keystroke or check/uncheck).
  const partitionedOptions = useMemo(() => {
    if (!checkedFirst) return filteredOptions;
    const selectedSet = new Set(selected);
    const checked = filteredOptions.filter((o) => selectedSet.has(o));
    const unchecked = filteredOptions.filter((o) => !selectedSet.has(o));
    return [...checked, ...unchecked];
  }, [filteredOptions, selected, checkedFirst]);

  // Cap the rendered rows. Footer uses cappedCount + total.
  const cappedOptions =
    typeof maxVisible === 'number' ? partitionedOptions.slice(0, maxVisible) : partitionedOptions;

  // Hide the "Showing N of X" footer when total fits in the cap AND there's no active search.
  const showFooter =
    typeof maxVisible === 'number' &&
    (options.length > maxVisible || (searchable && searchTerm.trim().length > 0));

  // Selection cap: once reached, unchecked options are disabled. Checked stay interactive.
  const capReached = typeof maxSelected === 'number' && selected.length >= maxSelected;

  return (
    <div key={id} style={{ marginBottom: 12 }} data-test-subj={`facetGroup-${id}`}>
      <EuiFlexGroup
        gutterSize="xs"
        alignItems="center"
        responsive={false}
        style={{ cursor: 'pointer', marginBottom: 4 }}
        onClick={() => onToggleCollapse(id)}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse(id);
          }
        }}
      >
        <EuiFlexItem grow={false}>
          <EuiIcon type={isCollapsed ? 'arrowRight' : 'arrowDown'} size="s" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs">
            <strong>{label}</strong>
          </EuiText>
        </EuiFlexItem>
        {activeCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">{activeCount}</EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {!isCollapsed && (
        <div style={{ paddingLeft: 4 }}>
          {searchable && (
            <>
              <EuiFieldSearch
                compressed
                fullWidth
                placeholder={`Search ${label.toLowerCase()}`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label={searchAriaLabel || `Search ${label}`}
                data-test-subj={`facetGroup-${id}-search`}
              />
              <EuiSpacer size="xs" />
            </>
          )}
          {cappedOptions.map((opt) => {
            const isActive = selected.includes(opt);
            const count = counts[opt] || 0;
            const displayLabel = displayMap?.[opt] || opt;
            const checkboxId = `${id}-${opt}`;
            // Checked items always remain interactive so the user can uncheck to free a slot.
            // When a consumer provided `onCapReached`, the option stays enabled (clickable)
            // and the click fires the callback instead of mutating selection — this lets
            // the consumer surface the cap feedback as a toast rather than greyed-out rows.
            const isDisabled = capReached && !isActive && !onCapReached;

            const labelContent = (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  width: '100%',
                  justifyContent: 'space-between',
                  opacity: isDisabled ? 0.5 : 1,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                  {colorMap && (
                    <EuiHealth color={colorMap[opt] || 'subdued'} style={{ marginRight: 0 }} />
                  )}
                  <span style={{ fontSize: '12px', lineHeight: '18px' }}>{displayLabel}</span>
                </span>
                <span style={{ fontSize: '12px', lineHeight: '18px', color: '#69707D' }}>
                  ({count})
                </span>
              </span>
            );

            return (
              <div key={opt} style={{ marginBottom: 2 }}>
                <EuiCheckbox
                  id={checkboxId}
                  label={labelContent}
                  checked={isActive}
                  disabled={isDisabled}
                  aria-label={
                    isDisabled ? `${displayLabel} (maximum datasources reached)` : undefined
                  }
                  onChange={() => {
                    if (isActive) {
                      onChange(selected.filter((s) => s !== opt));
                      return;
                    }
                    if (capReached && onCapReached) {
                      onCapReached();
                      return;
                    }
                    onChange([...selected, opt]);
                  }}
                  compressed
                />
              </div>
            );
          })}
          {showFooter && (
            <EuiText
              size="xs"
              color="subdued"
              style={{ marginTop: 4 }}
              data-test-subj={`facetGroup-${id}-footer`}
            >
              Showing {cappedOptions.length} of {options.length}
            </EuiText>
          )}
          {capReached && !onCapReached && (
            <EuiText
              size="xs"
              color="subdued"
              style={{ marginTop: 4 }}
              data-test-subj={`facetGroup-${id}-cap-helper`}
            >
              Maximum {maxSelected} datasources can be selected
            </EuiText>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// useFacetCollapse — hook to manage collapsed state
// ============================================================================

export function useFacetCollapse() {
  const [collapsedFacets, setCollapsedFacets] = useState<Set<string>>(new Set());

  const toggleFacetCollapse = useCallback((id: string) => {
    setCollapsedFacets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isCollapsed = useCallback((id: string) => collapsedFacets.has(id), [collapsedFacets]);

  return { collapsedFacets, toggleFacetCollapse, isCollapsed };
}
