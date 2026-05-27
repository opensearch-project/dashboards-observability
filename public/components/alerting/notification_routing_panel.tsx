/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Notification Routing Panel — read-only view of live Alertmanager configuration.
 * Fetches the parsed config from GET /api/alertmanager/config (routed through
 * OpenSearch Direct Query API proxy) and displays the route tree, receivers,
 * and inhibit rules.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiBadge,
  EuiButtonIcon,
  EuiCallOut,
  EuiCompressedSelect,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { Datasource } from '../../../common/types/alerting';
import { AlertmanagerAdminService } from './query_services/alertmanager_admin_service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertmanagerRoute {
  receiver?: string;
  group_by?: string[];
  group_wait?: string;
  group_interval?: string;
  repeat_interval?: string;
  matchers?: string[];
  match?: Record<string, string>;
  match_re?: Record<string, string>;
  continue?: boolean;
  routes?: AlertmanagerRoute[];
}

interface ReceiverInfo {
  name: string;
  integrations: Array<{ type: string; summary: string }>;
}

interface InhibitRule {
  source_matchers?: string[];
  target_matchers?: string[];
  source_match?: Record<string, string>;
  target_match?: Record<string, string>;
  equal?: string[];
}

interface AlertmanagerConfig {
  available: boolean;
  error?: string;
  configParseError?: string;
  cluster?: { status: string; peers: Array<{ name: string; address: string }>; peerCount: number };
  uptime?: string;
  versionInfo?: Record<string, string>;
  config?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Alertmanager global config has dynamic shape
    global?: Record<string, any>;
    route?: AlertmanagerRoute;
    receivers?: ReceiverInfo[];
    inhibitRules?: InhibitRule[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FlatRoute {
  depth: number;
  receiver: string;
  matchers: string[];
  groupBy: string[];
  groupWait: string;
  groupInterval: string;
  repeatInterval: string;
  continueMatching: boolean;
}

function flattenRoutes(route: AlertmanagerRoute | null | undefined, depth = 0): FlatRoute[] {
  if (!route) return [];
  const matchers = getMatchers(route);
  const flat: FlatRoute = {
    depth,
    receiver: route.receiver || '',
    matchers,
    groupBy: route.group_by || [],
    groupWait: route.group_wait || '',
    groupInterval: route.group_interval || '',
    repeatInterval: route.repeat_interval || '',
    continueMatching: route.continue || false,
  };
  const children = (route.routes || []).flatMap((r) => flattenRoutes(r, depth + 1));
  return [flat, ...children];
}

function getMatchers(route: AlertmanagerRoute): string[] {
  if (route.matchers && route.matchers.length > 0) return route.matchers;
  const result: string[] = [];
  if (route.match) {
    for (const [k, v] of Object.entries(route.match)) result.push(`${k}="${v}"`);
  }
  if (route.match_re) {
    for (const [k, v] of Object.entries(route.match_re)) result.push(`${k}=~"${v}"`);
  }
  return result;
}

function formatUptime(isoStr?: string): string {
  if (!isoStr) return '—';
  const start = new Date(isoStr).getTime();
  const diff = Date.now() - start;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(diff / 60000)}m`;
}

const INTEGRATION_COLORS: Record<string, string> = {
  webhook: 'hollow',
  slack: '#4A154B',
  email: 'primary',
  pagerduty: '#06AC38',
  opsgenie: '#2684FF',
  telegram: '#0088cc',
  msteams: '#6264A7',
  sns: '#FF9900',
  none: 'default',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface NotificationRoutingPanelProps {
  datasources: Datasource[];
}

export const NotificationRoutingPanel: React.FC<NotificationRoutingPanelProps> = ({
  datasources,
}) => {
  const adminService = useMemo(() => new AlertmanagerAdminService(), []);
  // Alertmanager is reached through a single Prometheus datasource at a time —
  // only parent Prom entries are candidates (workspace-derived entries share
  // the same Alertmanager endpoint as their parent).
  const promDatasources = useMemo(
    () => datasources.filter((d) => d.type === 'prometheus' && !d.parentDatasourceId),
    [datasources]
  );
  // Key selection off `directQueryName` (or `name`) rather than `id`, because
  // `id` is regenerated on every server-side datasource rediscovery cycle.
  const datasourceKey = useCallback((d: Datasource): string => d.directQueryName || d.name, []);
  const [selectedDsId, setSelectedDsId] = useState<string | undefined>(undefined);

  // Default to the first Prom datasource once loaded; preserve user choice across reloads.
  useEffect(() => {
    if (promDatasources.length === 0) return;
    const stillValid = promDatasources.some((d) => datasourceKey(d) === selectedDsId);
    if (!selectedDsId || !stillValid) {
      setSelectedDsId(datasourceKey(promDatasources[0]));
    }
  }, [promDatasources, selectedDsId, datasourceKey]);

  const [config, setConfig] = useState<AlertmanagerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminService.getConfig(selectedDsId);
      // The API client types route/inhibitRules as `unknown` because it's
      // handed back raw from Alertmanager; narrow to our local shape here.
      setConfig((res as unknown) as AlertmanagerConfig);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : i18n.translate('observability.alerting.notificationRoutingPanel.fetchConfigError', {
              defaultMessage: 'Failed to fetch Alertmanager config',
            })
      );
    }
    setLoading(false);
  }, [adminService, selectedDsId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Disambiguate duplicate names by appending the id — two Prom connections
  // can share a `name` across MDS clusters, and the dropdown would otherwise
  // show indistinguishable entries.
  const selectorOptions = useMemo(() => {
    const nameCounts = promDatasources.reduce<Record<string, number>>((acc, d) => {
      acc[d.name] = (acc[d.name] || 0) + 1;
      return acc;
    }, {});
    return promDatasources.map((d) => ({
      value: datasourceKey(d),
      text: nameCounts[d.name] > 1 ? `${d.name} (${d.id})` : d.name,
    }));
  }, [promDatasources, datasourceKey]);

  // Compact Prometheus datasource selector. Always rendered when a Prom DS
  // is available so the user can see which source the Alertmanager config is
  // coming from; disabled when there's only one (nothing to switch to).
  const datasourceSelector =
    promDatasources.length > 0 && selectedDsId ? (
      <EuiCompressedSelect
        prepend={i18n.translate('observability.alerting.notificationRoutingPanel.sourcePrepend', {
          defaultMessage: 'Source',
        })}
        options={selectorOptions}
        value={selectedDsId}
        onChange={(e) => setSelectedDsId(e.target.value)}
        disabled={promDatasources.length === 1}
        aria-label={i18n.translate(
          'observability.alerting.notificationRoutingPanel.sourceAriaLabel',
          { defaultMessage: 'Prometheus datasource' }
        )}
        data-test-subj="alertManagerRoutingDatasourceSelect"
        style={{ minWidth: 220 }}
      />
    ) : null;

  if (loading) {
    return (
      <div style={{ padding: '0 16px' }}>
        {datasourceSelector && (
          <>
            <EuiFlexGroup justifyContent="flexEnd" responsive={false}>
              <EuiFlexItem grow={false}>{datasourceSelector}</EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
          </>
        )}
        <EuiFlexGroup justifyContent="center" style={{ padding: 40 }}>
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '0 16px' }}>
        {datasourceSelector && (
          <>
            <EuiFlexGroup justifyContent="flexEnd" responsive={false}>
              <EuiFlexItem grow={false}>{datasourceSelector}</EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
          </>
        )}
        <EuiCallOut
          title={i18n.translate(
            'observability.alerting.notificationRoutingPanel.errorCallout.title',
            { defaultMessage: 'Error loading Alertmanager config' }
          )}
          color="danger"
          iconType="alert"
        >
          {error}
        </EuiCallOut>
      </div>
    );
  }

  if (!config?.available) {
    return (
      <div style={{ padding: '0 16px' }}>
        {datasourceSelector && (
          <>
            <EuiFlexGroup justifyContent="flexEnd" responsive={false}>
              <EuiFlexItem grow={false}>{datasourceSelector}</EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="s" />
          </>
        )}
        <EuiEmptyPrompt
          iconType="bell"
          title={
            <h2>
              <FormattedMessage
                id="observability.alerting.notificationRoutingPanel.notAvailable.title"
                defaultMessage="Alertmanager Not Available"
              />
            </h2>
          }
          body={
            <p>
              <FormattedMessage
                id="observability.alerting.notificationRoutingPanel.notAvailable.body"
                defaultMessage="No Alertmanager is connected. Ensure your Prometheus datasource in the OpenSearch SQL plugin has {code} configured in its properties."
                values={{ code: <code>alertmanager.uri</code> }}
              />
            </p>
          }
        />
      </div>
    );
  }

  if (config.configParseError) {
    return (
      <div style={{ padding: '0 16px' }}>
        <EuiCallOut
          title={i18n.translate(
            'observability.alerting.notificationRoutingPanel.parseErrorCallout.title',
            { defaultMessage: 'Failed to parse Alertmanager config' }
          )}
          color="warning"
          iconType="alert"
        >
          <p>{config.configParseError}</p>
        </EuiCallOut>
      </div>
    );
  }

  const routes = flattenRoutes(config.config?.route);
  const receivers = config.config?.receivers || [];
  const inhibitRules = config.config?.inhibitRules || [];
  const cluster = config.cluster;
  const version = config.versionInfo?.version || '—';

  // -----------------------------------------------------------------------
  // Route tree table
  // -----------------------------------------------------------------------

  const routeColumns = [
    {
      field: 'receiver',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.receiver', {
        defaultMessage: 'Receiver',
      }),
      render: (val: string, item: FlatRoute) => (
        <span style={{ paddingLeft: item.depth * 20, fontWeight: item.depth === 0 ? 600 : 400 }}>
          {item.depth > 0 && <span style={{ color: '#98A2B3', marginRight: 6 }}>{'└'}</span>}
          {val || (
            <EuiText size="xs" color="subdued">
              <em>
                <FormattedMessage
                  id="observability.alerting.notificationRoutingPanel.receiverInherited"
                  defaultMessage="inherited"
                />
              </em>
            </EuiText>
          )}
        </span>
      ),
    },
    {
      field: 'matchers',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.matchers', {
        defaultMessage: 'Matchers',
      }),
      render: (m: string[]) =>
        m.length > 0 ? (
          m.map((s, i) => (
            <EuiBadge key={i} color="hollow">
              {s}
            </EuiBadge>
          ))
        ) : (
          <EuiBadge color="default">
            {i18n.translate('observability.alerting.notificationRoutingPanel.catchAll', {
              defaultMessage: 'catch-all',
            })}
          </EuiBadge>
        ),
    },
    {
      field: 'groupBy',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.groupBy', {
        defaultMessage: 'Group By',
      }),
      render: (g: string[]) =>
        g.length > 0 ? (
          g.map((s, i) => (
            <EuiBadge key={i} color="primary">
              {s}
            </EuiBadge>
          ))
        ) : (
          <EuiText size="xs" color="subdued">
            —
          </EuiText>
        ),
    },
    {
      field: 'groupWait',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.wait', {
        defaultMessage: 'Wait',
      }),
      width: '70px',
      render: (v: string) => v || '—',
    },
    {
      field: 'groupInterval',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.interval', {
        defaultMessage: 'Interval',
      }),
      width: '80px',
      render: (v: string) => v || '—',
    },
    {
      field: 'repeatInterval',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.repeat', {
        defaultMessage: 'Repeat',
      }),
      width: '80px',
      render: (v: string) => v || '—',
    },
    {
      field: 'continueMatching',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.continue', {
        defaultMessage: 'Continue',
      }),
      width: '70px',
      render: (v: boolean) =>
        v ? (
          <EuiBadge color="warning">
            {i18n.translate('observability.alerting.notificationRoutingPanel.continueYes', {
              defaultMessage: 'yes',
            })}
          </EuiBadge>
        ) : (
          <EuiText size="xs" color="subdued">
            {i18n.translate('observability.alerting.notificationRoutingPanel.continueNo', {
              defaultMessage: 'no',
            })}
          </EuiText>
        ),
    },
  ];

  // -----------------------------------------------------------------------
  // Receivers table
  // -----------------------------------------------------------------------

  const receiverColumns: Array<EuiBasicTableColumn<ReceiverInfo>> = [
    {
      field: 'name',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.receiverName', {
        defaultMessage: 'Receiver',
      }),
      sortable: true,
    },
    {
      field: 'integrations',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.integrations', {
        defaultMessage: 'Integrations',
      }),
      render: (intgs: Array<{ type: string; summary: string }>) =>
        intgs.map((intg, i) => (
          <EuiToolTip key={i} content={intg.summary}>
            <EuiBadge color={INTEGRATION_COLORS[intg.type] || 'hollow'} style={{ marginRight: 4 }}>
              {intg.type}
            </EuiBadge>
          </EuiToolTip>
        )),
    },
  ];

  // -----------------------------------------------------------------------
  // Inhibit rules table
  // -----------------------------------------------------------------------

  const inhibitColumns = [
    {
      name: i18n.translate(
        'observability.alerting.notificationRoutingPanel.column.sourceMatchers',
        { defaultMessage: 'Source Matchers' }
      ),
      render: (rule: InhibitRule) => {
        const matchers =
          rule.source_matchers ||
          Object.entries(rule.source_match || {}).map(([k, v]) => `${k}="${v}"`);
        return matchers.map((m, i) => (
          <EuiBadge key={i} color="danger">
            {m}
          </EuiBadge>
        ));
      },
    },
    {
      name: i18n.translate(
        'observability.alerting.notificationRoutingPanel.column.targetMatchers',
        { defaultMessage: 'Target Matchers' }
      ),
      render: (rule: InhibitRule) => {
        const matchers =
          rule.target_matchers ||
          Object.entries(rule.target_match || {}).map(([k, v]) => `${k}="${v}"`);
        return matchers.map((m, i) => (
          <EuiBadge key={i} color="warning">
            {m}
          </EuiBadge>
        ));
      },
    },
    {
      field: 'equal',
      name: i18n.translate('observability.alerting.notificationRoutingPanel.column.equalLabels', {
        defaultMessage: 'Equal Labels',
      }),
      render: (labels: string[]) =>
        (labels || []).map((l, i) => (
          <EuiBadge key={i} color="hollow">
            {l}
          </EuiBadge>
        )),
    },
  ];

  return (
    <div style={{ padding: '0 16px' }}>
      {/* Read-only explanation banner (UX audit M6 + S-m8) */}
      <EuiCallOut
        title={i18n.translate(
          'observability.alerting.notificationRoutingPanel.readOnlyCallout.title',
          { defaultMessage: 'Read-only view' }
        )}
        color="primary"
        iconType="iInCircle"
        size="s"
      >
        <p>
          <FormattedMessage
            id="observability.alerting.notificationRoutingPanel.readOnlyCallout.body"
            defaultMessage="Routing configuration is managed via the Alertmanager configuration file or API. This view shows the current routing tree for all Prometheus datasources."
          />
        </p>
      </EuiCallOut>
      <EuiSpacer size="s" />

      {/* Cluster status bar */}
      <EuiPanel paddingSize="s" hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiHealth color={cluster?.status === 'ready' ? 'success' : 'danger'}>
              {cluster?.status ||
                i18n.translate(
                  'observability.alerting.notificationRoutingPanel.clusterStatusUnknown',
                  { defaultMessage: 'unknown' }
                )}
            </EuiHealth>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs">
              <FormattedMessage
                id="observability.alerting.notificationRoutingPanel.alertmanagerVersion"
                defaultMessage="{label} v{version}"
                values={{ label: <strong>Alertmanager</strong>, version }}
              />
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              <FormattedMessage
                id="observability.alerting.notificationRoutingPanel.uptime"
                defaultMessage="Uptime: {uptime}"
                values={{ uptime: formatUptime(config.uptime) }}
              />
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              <FormattedMessage
                id="observability.alerting.notificationRoutingPanel.peers"
                defaultMessage="Peers: {count}"
                values={{ count: cluster?.peerCount ?? 0 }}
              />
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow />
          {datasourceSelector && <EuiFlexItem grow={false}>{datasourceSelector}</EuiFlexItem>}
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={i18n.translate(
                'observability.alerting.notificationRoutingPanel.refreshTooltip',
                { defaultMessage: 'Refresh' }
              )}
            >
              <EuiButtonIcon
                iconType="refresh"
                aria-label={i18n.translate(
                  'observability.alerting.notificationRoutingPanel.refreshAriaLabel',
                  { defaultMessage: 'Refresh' }
                )}
                onClick={fetchConfig}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="s" />

      {/* Route tree */}
      <EuiTitle size="xs">
        <h3>
          <FormattedMessage
            id="observability.alerting.notificationRoutingPanel.routeTreeTitle"
            defaultMessage="Route Tree"
          />
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {routes.length > 0 ? (
        <EuiBasicTable items={routes} columns={routeColumns} />
      ) : (
        <EuiText size="s" color="subdued">
          <FormattedMessage
            id="observability.alerting.notificationRoutingPanel.noRoutes"
            defaultMessage="No routes configured"
          />
        </EuiText>
      )}

      <EuiSpacer size="s" />

      {/* Receivers */}
      <EuiTitle size="xs">
        <h3>
          <FormattedMessage
            id="observability.alerting.notificationRoutingPanel.receiversTitle"
            defaultMessage="Receivers ({count})"
            values={{ count: receivers.length }}
          />
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {receivers.length > 0 ? (
        <EuiBasicTable items={receivers} columns={receiverColumns} />
      ) : (
        <EuiText size="s" color="subdued">
          <FormattedMessage
            id="observability.alerting.notificationRoutingPanel.noReceivers"
            defaultMessage="No receivers configured"
          />
        </EuiText>
      )}

      <EuiSpacer size="s" />

      {/* Inhibit rules */}
      <EuiTitle size="xs">
        <h3>
          <FormattedMessage
            id="observability.alerting.notificationRoutingPanel.inhibitRulesTitle"
            defaultMessage="Inhibit Rules ({count})"
            values={{ count: inhibitRules.length }}
          />
        </h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {inhibitRules.length > 0 ? (
        <EuiBasicTable items={inhibitRules} columns={inhibitColumns} />
      ) : (
        <EuiText size="s" color="subdued">
          <FormattedMessage
            id="observability.alerting.notificationRoutingPanel.noInhibitRules"
            defaultMessage="No inhibit rules configured"
          />
        </EuiText>
      )}
    </div>
  );
};
