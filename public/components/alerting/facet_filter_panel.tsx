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
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiText,
  EuiTextColor,
  EuiBadge,
  EuiCheckbox,
  EuiHealth,
  EuiFieldSearch,
  EuiLink,
  EuiPopover,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { TruncatedLabel } from '../common/truncated_label';
// Note: `.altFacetErrorBtn` / `.altFacetErrorPopover` (and the pre-existing
// `altFacet*` classes) live in `alerting.scss`, which the alerting pages that
// render this component already import. This shared component deliberately
// does NOT import that stylesheet itself — doing so would pull Alert Manager's
// global EUI selector overrides into any future non-alerting consumer.

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
  /**
   * Optional per-option error message. When present for an option, an alert
   * icon renders trailing the label; clicking it opens a popover with the
   * message. Consumers use this to surface per-datasource connectivity
   * failures next to the failing datasource in the filter panel (rather
   * than in a page-level banner).
   */
  errorMap?: Record<string, string>;
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

// `TruncatedLabel` now lives in `../common/truncated_label` (shared with the
// SLO listing's datasource facet). Imported above.

// ============================================================================
// FacetErrorIndicator — click-to-open popover attached to a facet row
// ============================================================================
//
// Per-option error icon. Extracted into a sub-component so each row can own
// its popover state (a hook inside .map() is not permitted). It renders as a
// SIBLING of the row's checkbox — NOT inside the checkbox's `<label>` — so an
// interactive button is never nested inside a label (WCAG 4.1.2). Because it
// is no longer nested in an activatable control, it needs no event-propagation
// workaround: clicking it only toggles the error popover.
interface FacetErrorIndicatorProps {
  facetId: string;
  option: string;
  displayLabel: string;
  error: string;
}
const FacetErrorIndicator: React.FC<FacetErrorIndicatorProps> = ({
  facetId,
  option,
  displayLabel,
  error,
}) => {
  const [open, setOpen] = useState(false);
  const ariaLabel = i18n.translate('observability.alerting.facetFilterPanel.errorIconAriaLabel', {
    defaultMessage: '{displayLabel} — connection error, click for details',
    values: { displayLabel },
  });
  return (
    <EuiPopover
      isOpen={open}
      closePopover={() => setOpen(false)}
      panelPaddingSize="s"
      anchorPosition="rightCenter"
      button={
        <EuiButtonIcon
          iconType="alert"
          color="danger"
          size="xs"
          className="altFacetErrorBtn altFacetTarget"
          aria-label={ariaLabel}
          onClick={() => setOpen((v) => !v)}
          data-test-subj={`facetGroup-${facetId}-error-${option}`}
        />
      }
    >
      <div
        className="altFacetErrorPopover"
        data-test-subj={`facetGroup-${facetId}-error-${option}-popover`}
      >
        <EuiText size="xs">
          <strong>{displayLabel}</strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiText size="xs">{error}</EuiText>
      </div>
    </EuiPopover>
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
  errorMap,
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

  // Apply case-insensitive search filter against both the display label
  // and the raw option value (field name). This ensures searching for
  // either the human-readable label or the underlying field name returns
  // matching results.
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm.trim()) return options;
    const q = searchTerm.trim().toLowerCase();
    return options.filter((opt) => {
      const display = displayMap?.[opt] || opt;
      return display.toLowerCase().includes(q) || opt.toLowerCase().includes(q);
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
        style={{ marginBottom: 4 }}
      >
        {/*
         * The expand/collapse control is a real <button> (EuiButtonEmpty) so it
         * is natively keyboard-operable (Enter/Space toggle) and exposes
         * `aria-expanded`. It covers only the toggle/title area; the "Clear"
         * link is a SIBLING outside it (never a link nested inside a button),
         * which is why Clear no longer needs a stopPropagation workaround.
         */}
        <EuiFlexItem grow={true}>
          <EuiButtonEmpty
            size="xs"
            color="text"
            flush="left"
            // The button spans the full facet width (a large keyboard/touch
            // target), but its content span defaults to `justify-content:
            // center`, which centers the arrow + title instead of leaving them
            // flush-left. Pin the content to the start so the header aligns
            // with the plain-text groups (e.g. "Labels") at every panel width.
            // `flush="left"` only strips padding, not alignment.
            contentProps={{ style: { justifyContent: 'flex-start', width: '100%' } }}
            iconType={isCollapsed ? 'arrowRight' : 'arrowDown'}
            iconSide="left"
            onClick={() => onToggleCollapse(id)}
            aria-expanded={!isCollapsed}
            // Only reference the region while it's actually in the DOM. The
            // options region renders under `!isCollapsed`, so pointing
            // `aria-controls` at it while collapsed would be a dangling
            // reference (axe `aria-valid-attr-value`). `aria-expanded` already
            // conveys the collapsed state; `aria-controls` is optional here.
            aria-controls={isCollapsed ? undefined : `facetGroup-${id}-region`}
            data-test-subj={`facetGroup-${id}-toggle`}
          >
            <strong>{label}</strong>
            {showOptionCount && (
              <>
                {' '}
                <EuiTextColor
                  color="subdued"
                  className="altFacetCount"
                  data-test-subj={`facetGroup-${id}-optionCount`}
                >
                  {options.length}
                </EuiTextColor>
              </>
            )}
          </EuiButtonEmpty>
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
              onClick={() => onChange([])}
              data-test-subj={`facetGroup-${id}-clear`}
              className="altFacetTarget"
              style={{ padding: '0 4px' }}
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
        <div
          id={`facetGroup-${id}-region`}
          role="region"
          aria-label={label}
          style={{ paddingLeft: 4 }}
        >
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
                  {/* Explicit 12/18 preserves Alert Manager's existing look. */}
                  <TruncatedLabel text={displayLabel} fontSize={12} lineHeight={18} />
                </span>
                {showCounts && (
                  <EuiText size="xs" color="subdued" className="altFacetCount">
                    ({count})
                  </EuiText>
                )}
              </span>
            );

            return (
              // The error indicator is a SIBLING of the checkbox (not part of
              // the checkbox `label`), so no interactive button is nested inside
              // a `<label>` (WCAG 4.1.2 nested-interactive).
              <div key={opt} className="altFacetCheckboxRow">
                <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={true} style={{ minWidth: 0 }}>
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
                  </EuiFlexItem>
                  {errorMap?.[opt] && (
                    <EuiFlexItem grow={false}>
                      <FacetErrorIndicator
                        facetId={id}
                        option={opt}
                        displayLabel={displayLabel}
                        error={errorMap[opt]}
                      />
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
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
