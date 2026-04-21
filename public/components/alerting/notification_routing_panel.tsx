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
import React, { useState, useEffect, useCallback } from 'react';
import {
  EuiBasicTable,
  EuiBadge,
  EuiButtonIcon,
  EuiCallOut,
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
import { AlarmsApiClient } from './services/alarms_client';

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
  apiClient: AlarmsApiClient;
}

export const NotificationRoutingPanel: React.FC<NotificationRoutingPanelProps> = ({
  apiClient,
}) => {
  const [config, setConfig] = useState<AlertmanagerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getAlertmanagerConfig();
      setConfig(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch Alertmanager config');
    }
    setLoading(false);
  }, [apiClient]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  if (loading) {
    return (
      <EuiFlexGroup justifyContent="center" style={{ padding: 40 }}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="xl" />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (error) {
    return (
      <EuiCallOut title="Error loading Alertmanager config" color="danger" iconType="alert">
        {error}
      </EuiCallOut>
    );
  }

  if (!config?.available) {
    return (
      <EuiEmptyPrompt
        iconType="bell"
        title={<h2>Alertmanager Not Available</h2>}
        body={
          <p>
            No Alertmanager is connected. Ensure your Prometheus datasource in the OpenSearch SQL
            plugin has <code>alertmanager.uri</code> configured in its properties.
          </p>
        }
      />
    );
  }

  if (config.configParseError) {
    return (
      <EuiCallOut title="Failed to parse Alertmanager config" color="warning" iconType="alert">
        <p>{config.configParseError}</p>
      </EuiCallOut>
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
      name: 'Receiver',
      render: (val: string, item: FlatRoute) => (
        <span style={{ paddingLeft: item.depth * 20, fontWeight: item.depth === 0 ? 600 : 400 }}>
          {item.depth > 0 && <span style={{ color: '#98A2B3', marginRight: 6 }}>{'└'}</span>}
          {val || (
            <EuiText size="xs" color="subdued">
              <em>inherited</em>
            </EuiText>
          )}
        </span>
      ),
    },
    {
      field: 'matchers',
      name: 'Matchers',
      render: (m: string[]) =>
        m.length > 0 ? (
          m.map((s, i) => (
            <EuiBadge key={i} color="hollow">
              {s}
            </EuiBadge>
          ))
        ) : (
          <EuiBadge color="default">catch-all</EuiBadge>
        ),
    },
    {
      field: 'groupBy',
      name: 'Group By',
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
    { field: 'groupWait', name: 'Wait', width: '70px', render: (v: string) => v || '—' },
    { field: 'groupInterval', name: 'Interval', width: '80px', render: (v: string) => v || '—' },
    { field: 'repeatInterval', name: 'Repeat', width: '80px', render: (v: string) => v || '—' },
    {
      field: 'continueMatching',
      name: 'Continue',
      width: '70px',
      render: (v: boolean) =>
        v ? (
          <EuiBadge color="warning">yes</EuiBadge>
        ) : (
          <EuiText size="xs" color="subdued">
            no
          </EuiText>
        ),
    },
  ];

  // -----------------------------------------------------------------------
  // Receivers table
  // -----------------------------------------------------------------------

  const receiverColumns = [
    { field: 'name', name: 'Receiver', sortable: true },
    {
      field: 'integrations',
      name: 'Integrations',
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
      name: 'Source Matchers',
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
      name: 'Target Matchers',
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
      name: 'Equal Labels',
      render: (labels: string[]) =>
        (labels || []).map((l, i) => (
          <EuiBadge key={i} color="hollow">
            {l}
          </EuiBadge>
        )),
    },
  ];

  return (
    <div>
      {/* Read-only explanation banner (UX audit M6 + S-m8) */}
      <EuiCallOut title="Read-only view" color="primary" iconType="iInCircle" size="s">
        <p>
          Routing configuration is managed via the Alertmanager configuration file or API. This view
          shows the current routing tree for all Prometheus datasources.
        </p>
      </EuiCallOut>
      <EuiSpacer size="m" />

      {/* Cluster status bar */}
      <EuiPanel paddingSize="s" hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiHealth color={cluster?.status === 'ready' ? 'success' : 'danger'}>
              {cluster?.status || 'unknown'}
            </EuiHealth>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs">
              <strong>Alertmanager</strong> v{version}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              Uptime: {formatUptime(config.uptime)}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              Peers: {cluster?.peerCount ?? 0}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow />
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Refresh">
              <EuiButtonIcon iconType="refresh" aria-label="Refresh" onClick={fetchConfig} />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* Route tree */}
      <EuiTitle size="xs">
        <h3>Route Tree</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {routes.length > 0 ? (
        <EuiBasicTable items={routes} columns={routeColumns} />
      ) : (
        <EuiText size="s" color="subdued">
          No routes configured
        </EuiText>
      )}

      <EuiSpacer size="l" />

      {/* Receivers */}
      <EuiTitle size="xs">
        <h3>Receivers ({receivers.length})</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {receivers.length > 0 ? (
        <EuiBasicTable items={receivers} columns={receiverColumns} />
      ) : (
        <EuiText size="s" color="subdued">
          No receivers configured
        </EuiText>
      )}

      <EuiSpacer size="l" />

      {/* Inhibit rules */}
      <EuiTitle size="xs">
        <h3>Inhibit Rules ({inhibitRules.length})</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {inhibitRules.length > 0 ? (
        <EuiBasicTable items={inhibitRules} columns={inhibitColumns} />
      ) : (
        <EuiText size="s" color="subdued">
          No inhibit rules configured
        </EuiText>
      )}
    </div>
  );
};
