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
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiText,
  EuiBadge,
  EuiCheckbox,
  EuiHealth,
  EuiFieldSearch,
  EuiLink,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';

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
  /** Optional per-option leading icon (e.g. logoOpenSearch / logoPrometheus). */
  iconMap?: Record<string, string>;
  /** Enables a case-insensitive search input above the options list. */
  searchable?: boolean;
  /** Hide the `(count)` badge next to each option. Defaults to true. */
  showCounts?: boolean;
  /**
   * Render the number of distinct options as a subdued count next to the
   * facet header (e.g. `instance 9`). Useful for label-key facets where
   * the value cardinality is the most informative thing about the key.
   * Defaults to false — non-label facets (Severity, State, …) read better
   * without it because their option set is small and stable.
   */
  showOptionCount?: boolean;
  /** Override the aria-label for the search input (defaults to `Search ${label}`). */
  searchAriaLabel?: string;
  /**
   * Number of option rows rendered before a "+N more" / "Show less" toggle appears.
   * Remaining rows stay available — the user expands inline.
   */
  initialVisible?: number;
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
// TruncatedLabel — ellipsis + tooltip only when content overflows
// ============================================================================
//
// Uses a `ResizeObserver` to track the underlying span's `scrollWidth` vs
// `clientWidth`. When the parent panel is wide enough to fit the full label,
// no `title` is rendered. When the label is truncated (via CSS
// `text-overflow: ellipsis`), we attach a native `title` attribute so
// hovering shows the full value. Re-evaluates on resize.
const TruncatedLabel: React.FC<{ text: string }> = ({ text }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  // Custom instant-hover tooltip. `EuiToolTip` is unreliable when the anchor
  // is nested inside an EuiCheckbox `<label>` (the label intercepts events
  // and bubbles them to the paired input), and the browser's native `title`
  // has a ~500ms non-configurable delay. `position: fixed` escapes the
  // surrounding `overflow: hidden` clipping on the filter panel rows.
  const onEnter = () => {
    if (!isTruncated || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setTooltipPos({ top: rect.top - 28, left: rect.left });
  };
  const onLeave = () => setTooltipPos(null);

  return (
    <span className="altTruncatedLabelWrap" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <span
        ref={ref}
        className="altTruncatedLabel"
        style={{
          fontSize: '12px',
          lineHeight: '18px',
        }}
      >
        {text}
      </span>
      {tooltipPos && (
        <span
          className="altTruncatedLabelTooltip"
          role="tooltip"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          {text}
        </span>
      )}
    </span>
  );
};

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
  iconMap,
  searchable,
  showCounts = true,
  showOptionCount = false,
  searchAriaLabel,
  initialVisible,
  maxSelected,
  checkedFirst,
  onCapReached,
  isCollapsed,
  onToggleCollapse,
}) => {
  const activeCount = selected.length;
  const [searchTerm, setSearchTerm] = useState('');
  const [showAll, setShowAll] = useState(false);

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

  // Cap the rendered rows unless the user has toggled "Show more".
  const cappedOptions =
    typeof initialVisible === 'number' && !showAll
      ? partitionedOptions.slice(0, initialVisible)
      : partitionedOptions;

  // "+N more" toggle visibility — only when total exceeds the initial cap.
  const hasOverflow =
    typeof initialVisible === 'number' && partitionedOptions.length > initialVisible;
  const remainingCount = hasOverflow ? partitionedOptions.length - (initialVisible as number) : 0;

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
            {showOptionCount && (
              <>
                {' '}
                <EuiText
                  size="xs"
                  color="subdued"
                  className="altFacetCount"
                  data-test-subj={`facetGroup-${id}-optionCount`}
                >
                  {options.length}
                </EuiText>
              </>
            )}
          </EuiText>
        </EuiFlexItem>
        {activeCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">{activeCount}</EuiBadge>
          </EuiFlexItem>
        )}
        {activeCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiLink
              color="primary"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onChange([]);
              }}
              data-test-subj={`facetGroup-${id}-clear`}
            >
              <EuiText size="xs">
                <FormattedMessage
                  id="observability.alerting.facetFilterPanel.clear"
                  defaultMessage="Clear"
                />
              </EuiText>
            </EuiLink>
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
                placeholder={i18n.translate(
                  'observability.alerting.facetFilterPanel.searchPlaceholder',
                  {
                    defaultMessage: 'Search {label}',
                    values: { label: label.toLowerCase() },
                  }
                )}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label={
                  searchAriaLabel ||
                  i18n.translate('observability.alerting.facetFilterPanel.searchAriaLabel', {
                    defaultMessage: 'Search {label}',
                    values: { label },
                  })
                }
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
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {colorMap && (
                    <EuiHealth color={colorMap[opt] || 'subdued'} style={{ marginRight: 0 }} />
                  )}
                  {iconMap?.[opt] && (
                    <EuiIcon
                      type={iconMap[opt]}
                      size="s"
                      style={{ flexShrink: 0 }}
                      data-test-subj={`facetGroup-${id}-icon-${opt}`}
                    />
                  )}
                  <TruncatedLabel text={displayLabel} />
                </span>
                {showCounts && (
                  <EuiText size="xs" color="subdued" className="altFacetCount">
                    ({count})
                  </EuiText>
                )}
              </span>
            );

            return (
              <div key={opt} className="altFacetCheckboxRow">
                <EuiCheckbox
                  id={checkboxId}
                  label={labelContent}
                  checked={isActive}
                  disabled={isDisabled}
                  aria-label={
                    isDisabled
                      ? i18n.translate(
                          'observability.alerting.facetFilterPanel.disabledAriaLabel',
                          {
                            defaultMessage: '{displayLabel} (maximum datasources reached)',
                            values: { displayLabel },
                          }
                        )
                      : undefined
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
          {hasOverflow && (
            <EuiLink
              onClick={() => setShowAll((v) => !v)}
              color="primary"
              data-test-subj={`facetGroup-${id}-showMore`}
              style={{ marginTop: 4 }}
            >
              <EuiText size="xs">
                {showAll ? (
                  <FormattedMessage
                    id="observability.alerting.facetFilterPanel.showLess"
                    defaultMessage="Show less"
                  />
                ) : (
                  <FormattedMessage
                    id="observability.alerting.facetFilterPanel.showMore"
                    defaultMessage="+{count} more"
                    values={{ count: remainingCount }}
                  />
                )}
              </EuiText>
            </EuiLink>
          )}
          {capReached && !onCapReached && (
            <EuiText
              size="xs"
              color="subdued"
              style={{ marginTop: 4 }}
              data-test-subj={`facetGroup-${id}-cap-helper`}
            >
              <FormattedMessage
                id="observability.alerting.facetFilterPanel.maxDatasources"
                defaultMessage="Maximum {maxSelected} datasources can be selected"
                values={{ maxSelected }}
              />
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

// User overrides are stored as a Map<id, boolean>:
//   - present + true  → user explicitly collapsed
//   - present + false → user explicitly expanded
//   - absent          → fall through to the per-call default
// This lets callers default specific facets (e.g. label facets discovered
// dynamically from alert data) to collapsed without forcing the user to
// re-collapse them on every render.
export function useFacetCollapse() {
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());

  const toggleFacetCollapse = useCallback((id: string, defaultCollapsed = false) => {
    setOverrides((prev) => {
      const current = prev.has(id) ? prev.get(id)! : defaultCollapsed;
      const next = new Map(prev);
      next.set(id, !current);
      return next;
    });
  }, []);

  const isCollapsed = useCallback(
    (id: string, defaultCollapsed = false) =>
      overrides.has(id) ? overrides.get(id)! : defaultCollapsed,
    [overrides]
  );

  return { toggleFacetCollapse, isCollapsed };
}
