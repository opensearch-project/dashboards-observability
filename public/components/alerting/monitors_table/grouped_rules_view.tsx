/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Grouped view for Prometheus rules — renders rules organized under
 * collapsible rule-group headers. Non-Prometheus rules are shown in a
 * flat "Other rules" section at the bottom.
 */
import React, { useState, useMemo } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiInMemoryTable,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { UnifiedRuleSummary } from '../../../../common/types/alerting';

export interface GroupedRulesViewProps {
  items: UnifiedRuleSummary[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: any[];
  loading: boolean;
  rowProps: (item: UnifiedRuleSummary) => React.HTMLAttributes<HTMLTableRowElement>;
}

interface RuleGroup {
  namespace: string;
  groupName: string;
  rules: UnifiedRuleSummary[];
}

export const GroupedRulesView: React.FC<GroupedRulesViewProps> = ({
  items,
  columns,
  loading,
  rowProps,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { prometheusGroups, otherRules } = useMemo(() => {
    const promRules = items.filter((r) => r.monitorType === 'metric' && r.group);
    const other = items.filter((r) => r.monitorType !== 'metric' || !r.group);

    // Group Prometheus rules by their rule group
    const groupMap = new Map<string, UnifiedRuleSummary[]>();
    promRules.forEach((rule) => {
      const key = rule.group!;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(rule);
    });

    const groups: RuleGroup[] = Array.from(groupMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupName, rules]) => ({
        namespace: 'observability-alerting',
        groupName,
        rules,
      }));

    return { prometheusGroups: groups, otherRules: other };
  }, [items]);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  if (prometheusGroups.length === 0) {
    // No Prometheus rules — render flat table as before
    return (
      <EuiInMemoryTable
        items={items}
        columns={columns}
        loading={loading}
        pagination={{ initialPageSize: 20, pageSizeOptions: [10, 20, 50] }}
        sorting={{ sort: { field: 'name', direction: 'asc' } }}
        rowProps={rowProps}
      />
    );
  }

  return (
    <div>
      {/* Prometheus namespace header */}
      <EuiPanel paddingSize="s" color="subdued" hasBorder={false}>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="folderClosed" size="m" />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <strong>observability-alerting</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">
              {i18n.translate('observability.alerting.groupedView.namespaceLabel', {
                defaultMessage: 'namespace',
              })}
            </EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.alerting.groupedView.groupCount', {
                defaultMessage: '{count} rule {count, plural, one {group} other {groups}}',
                values: { count: prometheusGroups.length },
              })}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="xs" />

      {/* Rule groups */}
      {prometheusGroups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.groupName);
        return (
          <div key={group.groupName} style={{ marginLeft: 24, marginBottom: 4 }}>
            <EuiAccordion
              id={`rule-group-${group.groupName}`}
              buttonContent={
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="folderOpen" size="s" />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s">
                      <strong>{group.groupName}</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">
                      {i18n.translate('observability.alerting.groupedView.ruleGroupLabel', {
                        defaultMessage: 'rule group',
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {i18n.translate('observability.alerting.groupedView.ruleCount', {
                        defaultMessage: '{count} {count, plural, one {rule} other {rules}}',
                        values: { count: group.rules.length },
                      })}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              }
              initialIsOpen
              paddingSize="none"
            >
              <div style={{ marginLeft: 16 }}>
                <EuiInMemoryTable
                  items={group.rules}
                  columns={columns}
                  loading={loading}
                  rowProps={rowProps}
                  pagination={false}
                  sorting={{ sort: { field: 'name', direction: 'asc' } }}
                />
              </div>
            </EuiAccordion>
          </div>
        );
      })}

      {/* Non-Prometheus rules */}
      {otherRules.length > 0 && (
        <>
          <EuiSpacer size="m" />
          <EuiPanel paddingSize="s" color="subdued" hasBorder={false}>
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon type="folderClosed" size="m" />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <strong>
                    {i18n.translate('observability.alerting.groupedView.otherRulesTitle', {
                      defaultMessage: 'OpenSearch monitors',
                    })}
                  </strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {i18n.translate('observability.alerting.groupedView.otherRulesCount', {
                    defaultMessage: '{count} {count, plural, one {rule} other {rules}}',
                    values: { count: otherRules.length },
                  })}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
          <EuiSpacer size="xs" />
          <EuiInMemoryTable
            items={otherRules}
            columns={columns}
            loading={loading}
            pagination={{ initialPageSize: 20, pageSizeOptions: [10, 20, 50] }}
            sorting={{ sort: { field: 'name', direction: 'asc' } }}
            rowProps={rowProps}
          />
        </>
      )}
    </div>
  );
};
