/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerts Summary Cards — stat cards for the alerts dashboard.
 * Each card is clickable to filter alerts by severity or state.
 */
import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiStat, EuiText } from '@elastic/eui';

// ============================================================================
// Types
// ============================================================================

export interface AlertsSummaryCardsProps {
  filteredCount: number;
  totalCount: number;
  activeCount: number;
  severityCounts: Record<string, number>;
  severityFilter: string;
  stateFilter: string;
  filtersSeverityLength: number;
  filtersStateLength: number;
  isFiltered: boolean;
  onShowAll: () => void;
  onToggleActive: () => void;
  onToggleCritical: () => void;
  onToggleHigh: () => void;
  onToggleMedium: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function handleKeyDown(onClick: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };
}

// ============================================================================
// AlertsSummaryCards
// ============================================================================

export const AlertsSummaryCards: React.FC<AlertsSummaryCardsProps> = ({
  filteredCount,
  totalCount,
  activeCount,
  severityCounts,
  severityFilter,
  stateFilter,
  filtersSeverityLength,
  filtersStateLength,
  isFiltered,
  onShowAll,
  onToggleActive,
  onToggleCritical,
  onToggleHigh,
  onToggleMedium,
}) => {
  const isAllActive =
    severityFilter === 'all' &&
    stateFilter === 'all' &&
    filtersSeverityLength === 0 &&
    filtersStateLength === 0;

  return (
    <EuiFlexGroup gutterSize="m" responsive={true} data-test-subj="alertsSummaryCards">
      {/* Total */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={onShowAll}
          onKeyDown={handleKeyDown(onShowAll)}
          tabIndex={0}
          role="button"
          aria-label="Show all alerts"
          style={{
            cursor: 'pointer',
            boxShadow: isAllActive ? 'inset 0 0 0 2px #006BB4' : 'none',
            backgroundColor: isAllActive ? '#E6F0FF' : undefined,
            borderRadius: 6,
          }}
          data-test-subj="alertStatCardTotal"
        >
          <EuiStat
            title={filteredCount}
            description={isFiltered ? `of ${totalCount} Total Alerts` : 'Total Alerts'}
            titleSize="m"
          />
        </EuiPanel>
      </EuiFlexItem>

      {/* Active */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={onToggleActive}
          onKeyDown={handleKeyDown(onToggleActive)}
          tabIndex={0}
          role="button"
          aria-label="Filter by active alerts"
          style={{
            cursor: 'pointer',
            boxShadow: stateFilter === 'active' ? 'inset 0 0 0 2px #BD271E' : 'none',
            backgroundColor: stateFilter === 'active' ? '#E6F0FF' : undefined,
            borderRadius: 6,
          }}
          data-test-subj="alertStatCardActive"
        >
          <EuiStat title={activeCount} description="Active" titleColor="danger" titleSize="m" />
          {stateFilter === 'active' && (
            <EuiText size="xs" color="subdued">
              <em>Filtered</em>
            </EuiText>
          )}
        </EuiPanel>
      </EuiFlexItem>

      {/* Critical */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={onToggleCritical}
          onKeyDown={handleKeyDown(onToggleCritical)}
          tabIndex={0}
          role="button"
          aria-label="Filter by critical alerts"
          style={{
            cursor: 'pointer',
            boxShadow: severityFilter === 'critical' ? 'inset 0 0 0 2px #BD271E' : 'none',
            backgroundColor: severityFilter === 'critical' ? '#E6F0FF' : undefined,
            borderRadius: 6,
          }}
          data-test-subj="alertStatCardCritical"
        >
          <EuiStat
            title={severityCounts.critical || 0}
            description="Critical"
            titleColor="danger"
            titleSize="m"
          />
          {severityFilter === 'critical' && (
            <EuiText size="xs" color="subdued">
              <em>Filtered</em>
            </EuiText>
          )}
        </EuiPanel>
      </EuiFlexItem>

      {/* High */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={onToggleHigh}
          onKeyDown={handleKeyDown(onToggleHigh)}
          tabIndex={0}
          role="button"
          aria-label="Filter by high severity alerts"
          style={{
            cursor: 'pointer',
            boxShadow: severityFilter === 'high' ? 'inset 0 0 0 2px #F5A700' : 'none',
            backgroundColor: severityFilter === 'high' ? '#E6F0FF' : undefined,
            borderRadius: 6,
          }}
          data-test-subj="alertStatCardHigh"
        >
          <EuiStat
            title={severityCounts.high || 0}
            description="High"
            titleColor="default"
            titleSize="m"
          />
          {severityFilter === 'high' && (
            <EuiText size="xs" color="subdued">
              <em>Filtered</em>
            </EuiText>
          )}
        </EuiPanel>
      </EuiFlexItem>

      {/* Medium / Low */}
      <EuiFlexItem>
        <EuiPanel
          paddingSize="m"
          hasBorder
          onClick={onToggleMedium}
          onKeyDown={handleKeyDown(onToggleMedium)}
          tabIndex={0}
          role="button"
          aria-label="Filter by medium and low severity alerts"
          style={{
            cursor: 'pointer',
            boxShadow: severityFilter === 'medium' ? 'inset 0 0 0 2px #006BB4' : 'none',
            backgroundColor: severityFilter === 'medium' ? '#E6F0FF' : undefined,
            borderRadius: 6,
          }}
          data-test-subj="alertStatCardMedium"
        >
          <EuiStat
            title={
              (severityCounts.medium || 0) + (severityCounts.low || 0) + (severityCounts.info || 0)
            }
            description="Medium / Low"
            titleSize="m"
          />
          {severityFilter === 'medium' && (
            <EuiText size="xs" color="subdued">
              <em>Filtered</em>
            </EuiText>
          )}
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
