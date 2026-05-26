/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerts panel for the SLO detail page.
 *
 * Lists the rule GROUPS deployed for this SLO (from the rule-health probe /
 * the persisted provisioning record) and offers deep-links into Alert
 * Manager filtered to this SLO's `slo_id` label. Sits above the Advanced
 * details accordion so operators can jump to the alert surface without
 * hunting through recording-rule names.
 *
 * The rule-health callout on the detail page already surfaces missing /
 * partial groups as a primary affordance — this panel reflects the same
 * signal as a small badge but does not duplicate the callout.
 */

import React from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { coreRefs } from '../../../../framework/core_refs';
import { observabilityAlertingID } from '../../../../../common/constants/shared';
import type { RuleHealthResponse } from './slo_api_client';
import type { SloDocument, SloLiveStatus } from '../../../../../common/slo/slo_types';

type FullDoc = SloDocument & { liveStatus: SloLiveStatus };

export interface SloAlertsPanelProps {
  doc: FullDoc;
  ruleHealth: RuleHealthResponse | null;
}

/**
 * Build a hash-route deep link to Alert Manager's Rules tab. The alarms
 * page parses `?q=…` from the hash and seeds MonitorsTable's search box
 * (alarms_page.tsx :: parseAlarmsHashRoute). MonitorsTable's
 * `matchesSearch` supports `label:value` syntax, so passing one or more
 * label predicates narrows the table to those rules.
 *
 * Every alerting rule generated for an SLO carries `slo_id=<id>` as a
 * label; burn-rate tier rules additionally carry
 * `slo_burn_rate_multiplier=<n>`. Pass extras as labelKey → labelValue
 * pairs to compose AND-joined predicates; the search input is whitespace-
 * separated.
 */
function buildRulesPath(sloId: string, extraLabels?: Record<string, string>): string {
  const terms = [`slo_id:${sloId}`];
  if (extraLabels) {
    for (const [k, v] of Object.entries(extraLabels)) {
      if (v) terms.push(`${k}:${v}`);
    }
  }
  const params = new URLSearchParams({ q: terms.join(' ') });
  return `#/rules?${params.toString()}`;
}

function navigateToAlertManager(sloId: string, extraLabels?: Record<string, string>): void {
  const path = buildRulesPath(sloId, extraLabels);
  coreRefs?.application?.navigateToApp(observabilityAlertingID, { path });
  // Alerting home uses HashRouter; pushState doesn't trigger hashchange.
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export const SloAlertsPanel: React.FC<SloAlertsPanelProps> = ({ doc, ruleHealth }) => {
  const prov = doc.status.provisioning.backend === 'prometheus' ? doc.status.provisioning : null;
  const isShadow = doc.spec.mode === 'shadow';

  if (!prov) {
    // Non-Prometheus provisioning — listing requires a Prometheus-compatible
    // ruler. Keep the panel rendered so the heading is consistent but
    // explain the empty state.
    return (
      <EuiPanel data-test-subj="slosDetailAlertsPanel">
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem>
            <EuiText size="m">
              <h4>
                {i18n.translate('observability.apm.slo.alertsPanel.heading', {
                  defaultMessage: 'Alerts',
                })}
              </h4>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiText size="s" color="subdued">
          {i18n.translate('observability.apm.slo.alertsPanel.unsupportedDatasource', {
            defaultMessage: 'Alert listings require a Prometheus-compatible datasource.',
          })}
        </EuiText>
      </EuiPanel>
    );
  }

  const ruleHealthState = ruleHealth?.state;
  const hasHealthIssue = ruleHealthState === 'rules_missing' || ruleHealthState === 'rules_partial';

  const expectedGroups =
    ruleHealth?.expectedGroups && ruleHealth.expectedGroups.length > 0
      ? ruleHealth.expectedGroups
      : prov.alertGroupName
      ? [prov.alertGroupName]
      : [];
  const presentGroups = new Set(ruleHealth?.presentGroups ?? []);

  const ruleCount = doc.liveStatus.ruleCount ?? 0;
  const firingCount = doc.liveStatus.firingCount ?? 0;
  const groupCount = expectedGroups.length;

  const subtitle = isShadow
    ? i18n.translate('observability.apm.slo.alertsPanel.shadowSubtitle', {
        defaultMessage: 'Shadow mode — alerts suppressed; recording rules only.',
      })
    : `${i18n.translate('observability.apm.slo.alertsPanel.ruleSubtitle', {
        defaultMessage:
          '{ruleCount, plural, one {# rule} other {# rules}} across {groupCount, plural, one {# group} other {# groups}}',
        values: { ruleCount, groupCount },
      })}${
        firingCount > 0
          ? ` · ${i18n.translate('observability.apm.slo.alertsPanel.firingSuffix', {
              defaultMessage: '{firingCount} firing',
              values: { firingCount },
            })}`
          : ''
      }`;

  return (
    <EuiPanel data-test-subj="slosDetailAlertsPanel">
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="m">
                <h4>
                  {i18n.translate('observability.apm.slo.alertsPanel.heading', {
                    defaultMessage: 'Alerts',
                  })}
                </h4>
              </EuiText>
            </EuiFlexItem>
            {hasHealthIssue && (
              <EuiFlexItem grow={false}>
                <EuiBadge
                  color="danger"
                  iconType="alert"
                  data-test-subj="slosDetailAlertsPanelHealthBadge"
                >
                  {i18n.translate('observability.apm.slo.alertsPanel.healthBadge', {
                    defaultMessage: 'Rule groups missing',
                  })}
                </EuiBadge>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
          <EuiText
            size="xs"
            color={isShadow ? 'warning' : 'subdued'}
            data-test-subj="slosDetailAlertsPanelSubtitle"
          >
            {subtitle}
          </EuiText>
        </EuiFlexItem>
        {!isShadow && (
          <EuiFlexItem grow={false}>
            <EuiLink
              data-test-subj="slosDetailAlertsPanelViewAll"
              onClick={() => navigateToAlertManager(doc.id)}
            >
              {i18n.translate('observability.apm.slo.alertsPanel.viewAllLink', {
                defaultMessage: 'View all in Alert Manager',
              })}
            </EuiLink>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      {expectedGroups.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.translate('observability.apm.slo.alertsPanel.noGroupsDeployed', {
            defaultMessage: 'No alert rule groups deployed.',
          })}
        </EuiText>
      ) : (
        <div data-test-subj="slosDetailAlertsPanelGroupList">
          {expectedGroups.map((groupName) => {
            // If the probe has returned, mark groups not in presentGroups as
            // missing. If the probe hasn't returned (no ruleHealth), fall back
            // to treating the persisted provisioning group as present — the
            // same assumption the Advanced details panel already makes.
            const probeReturned = ruleHealth !== null;
            const present = probeReturned ? presentGroups.has(groupName) : true;
            // Recording groups (`slo:rec:…`) don't surface in Alert Manager
            // — alert_service.fetchRulesRaw filters Cortex rules with
            // `r.type === 'alerting'` before they reach MonitorsTable — so
            // a "View" link on those rows would land on an empty list.
            // Only render the deep-link affordance for alert groups.
            const isAlertGroup = groupName.startsWith('slo:alerts:');
            return (
              <EuiFlexGroup
                key={groupName}
                alignItems="center"
                gutterSize="s"
                responsive={false}
                style={{ marginBottom: 6 }}
              >
                <EuiFlexItem grow={false}>
                  <EuiIcon
                    type={present ? 'check' : 'alert'}
                    color={present ? 'success' : 'danger'}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText size="s">{groupName}</EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiBadge color={present ? 'success' : 'danger'}>
                    {present
                      ? i18n.translate('observability.apm.slo.alertsPanel.groupPresentBadge', {
                          defaultMessage: 'present',
                        })
                      : i18n.translate('observability.apm.slo.alertsPanel.groupMissingBadge', {
                          defaultMessage: 'missing',
                        })}
                  </EuiBadge>
                </EuiFlexItem>
                {!isShadow && isAlertGroup && (
                  <EuiFlexItem grow={false}>
                    <EuiLink
                      data-test-subj={`slosDetailAlertsPanelGroupView-${groupName}`}
                      onClick={() => navigateToAlertManager(doc.id)}
                    >
                      {i18n.translate('observability.apm.slo.alertsPanel.viewGroupLink', {
                        defaultMessage: 'View',
                      })}
                    </EuiLink>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            );
          })}
        </div>
      )}
    </EuiPanel>
  );
};
