/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiCode,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { ServiceInfrastructure as InfraState } from '../../common/types/infra_types';

const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
  i18n.translate(`observability.apm.serviceInfrastructure.setup.${id}`, {
    defaultMessage,
    values,
  });

export type SetupStatus = 'ok' | 'missing' | 'optional' | 'pending';

export interface SetupStatuses {
  /** The service's spans carry platform attributes (collector, traces pipeline). */
  spans: SetupStatus;
  /** Data Prepper stored the keys on the service map (optional). */
  serviceMap: SetupStatus;
  /** Prometheus has infra metrics with the same labels (collector, metrics pipeline). */
  metrics: SetupStatus;
  /** Pods or hosts were matched to the service. */
  match: SetupStatus;
}

/** Where the link from a service to its infrastructure breaks, step by step. */
export function getSetupStatuses(state: InfraState): SetupStatuses {
  const spans: SetupStatus = state.platform !== 'none' ? 'ok' : 'missing';
  const serviceMap: SetupStatus =
    state.keySource === 'serviceMap'
      ? 'ok'
      : state.detectionEnabled && spans === 'missing'
        ? 'pending'
        : 'optional';
  const metrics: SetupStatus = spans !== 'ok' ? 'pending' : state.labelStyle ? 'ok' : 'missing';
  const match: SetupStatus =
    metrics !== 'ok'
      ? 'pending'
      : state.pods.length > 0 || state.hostIds.length > 0
        ? 'ok'
        : 'missing';
  return { spans, serviceMap, metrics, match };
}

const STATUS_ICON: Record<SetupStatus, { type: string; color: string; label: string }> = {
  ok: { type: 'checkInCircleFilled', color: 'success', label: 'OK' },
  missing: { type: 'alert', color: 'warning', label: 'Missing' },
  optional: { type: 'iInCircle', color: 'primary', label: 'Optional' },
  pending: { type: 'clock', color: 'subdued', label: 'Not checked yet' },
};

const isKubernetes = (state: InfraState) =>
  state.platform === 'eks' || state.platform === 'kubernetes';
const isHost = (state: InfraState) => state.platform === 'ec2' || state.platform === 'host';

const Node: React.FC<{
  title: string;
  status?: SetupStatus;
  codes?: string[];
  caption: string;
  testSubj: string;
  style?: React.CSSProperties;
}> = ({ title, status, codes, caption, testSubj, style }) => {
  const icon = status ? STATUS_ICON[status] : undefined;
  return (
    <div
      className={`apmInfraSetup__node apmInfraSetup__node--${status ?? 'source'}`}
      style={style}
      data-test-subj={testSubj}
      data-status={status}
    >
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
        {icon && (
          <EuiFlexItem grow={false}>
            <EuiIcon type={icon.type} color={icon.color} aria-label={icon.label} />
          </EuiFlexItem>
        )}
        <EuiFlexItem>
          <EuiText size="xs" className="apmInfraSetup__nodeTitle">
            {title}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      {codes && (
        <div className="apmInfraSetup__codes">
          {codes.map((c) => (
            <EuiCode key={c}>{c}</EuiCode>
          ))}
        </div>
      )}
      <EuiText size="xs" color="subdued">
        <p style={{ marginTop: 4 }}>{caption}</p>
      </EuiText>
    </div>
  );
};

const Arrow: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <div className="apmInfraSetup__arrow" style={style} aria-hidden="true">
    <EuiIcon type="sortRight" color="subdued" />
  </div>
);

/**
 * The data path the tab depends on: spans and infra metrics leave the collector on separate
 * pipelines and only meet on this tab, joined on the resource attributes they share.
 */
export const SetupDiagram: React.FC<{ state: InfraState; statuses: SetupStatuses }> = ({
  state,
  statuses,
}) => {
  const k8s = isKubernetes(state);
  const host = isHost(state);
  const traceProcessors = k8s
    ? ['k8s_attributes (k8sattributes)']
    : host
      ? ['resource_detection (resourcedetection)']
      : ['k8s_attributes (k8sattributes)', 'resource_detection (resourcedetection)'];
  const metricReceivers = k8s
    ? ['kubelet_stats (kubeletstats)', 'k8s_cluster']
    : host
      ? ['host_metrics (hostmetrics)']
      : ['kubelet_stats (kubeletstats)', 'k8s_cluster', 'host_metrics (hostmetrics)'];
  const cell = (column: number, row: number | string) => ({ gridColumn: column, gridRow: row });

  return (
    <div className="apmInfraSetup__scroll">
      <div className="apmInfraSetup__diagram" data-test-subj="serviceInfrastructureSetupDiagram">
        <Node
          title={t('node.service', 'Your service')}
          caption={t('node.serviceCaption', 'OpenTelemetry SDK: spans')}
          testSubj="setupNodeService"
          style={cell(1, 1)}
        />
        <Arrow style={cell(2, 1)} />
        <Node
          title={t('node.traces', 'Collector: traces pipeline')}
          status={statuses.spans}
          codes={traceProcessors}
          caption={
            statuses.spans === 'ok'
              ? t('node.tracesOk', 'Spans carry the platform attributes')
              : t('node.tracesMissing', 'Spans carry no k8s.* or host.id attributes')
          }
          testSubj="setupNodeTraces"
          style={cell(3, 1)}
        />
        <Arrow style={cell(4, 1)} />
        <Node
          title={t('node.dataPrepper', 'Data Prepper')}
          status={statuses.serviceMap}
          codes={['platform_detection']}
          caption={
            statuses.serviceMap === 'ok'
              ? t('node.dataPrepperOk', 'Keys stored on the service map')
              : statuses.serviceMap === 'pending'
                ? t('node.dataPrepperPending', 'On, but the spans have no keys to store')
                : t('node.dataPrepperOptional', 'Optional: keys are read from recent spans')
          }
          testSubj="setupNodeDataPrepper"
          style={cell(5, 1)}
        />
        <Arrow style={cell(6, '1 / span 2')} />
        <Node
          title={t('node.tab', 'This tab')}
          status={statuses.match}
          caption={
            statuses.match === 'ok'
              ? t('node.tabOk', 'Matched on the shared keys')
              : k8s
                ? t('node.tabK8s', 'Joins on cluster + namespace + workload')
                : host
                  ? t('node.tabHost', 'Joins on host.id')
                  : t('node.tabAny', 'Joins on cluster + namespace + workload, or host.id')
          }
          testSubj="setupNodeTab"
          style={{ ...cell(7, '1 / span 2'), alignSelf: 'center' }}
        />

        <Node
          title={
            k8s
              ? t('node.nodes', 'Nodes and pods')
              : host
                ? t('node.host', 'Host')
                : t('node.infra', 'Nodes / hosts')
          }
          caption={t('node.infraCaption', 'kubelet, cluster API, host OS')}
          testSubj="setupNodeInfra"
          style={cell(1, 2)}
        />
        <Arrow style={cell(2, 2)} />
        <Node
          title={t('node.metrics', 'Collector: metrics pipeline')}
          status={statuses.metrics}
          codes={metricReceivers}
          caption={
            statuses.metrics === 'ok'
              ? t('node.metricsOk', 'Series found with matching labels')
              : statuses.metrics === 'missing'
                ? t('node.metricsMissing', 'No series with the same labels as the spans')
                : t('node.metricsPending', 'Checked once the spans carry keys')
          }
          testSubj="setupNodeMetrics"
          style={cell(3, 2)}
        />
        <Arrow style={cell(4, 2)} />
        <Node
          title={t('node.prometheus', 'Prometheus')}
          caption={
            state.labelStyle === 'resource'
              ? t('node.prometheusResource', 'resource_* labels (Data Prepper sink)')
              : state.labelStyle === 'plain'
                ? t('node.prometheusPlain', 'Plain labels (collector remote write)')
                : t('node.prometheusAny', 'Plain or resource_* labels')
          }
          testSubj="setupNodePrometheus"
          style={cell(5, 2)}
        />
      </div>
    </div>
  );
};

const Fix: React.FC<{ title: string; testSubj: string; children?: React.ReactNode }> = ({
  title,
  testSubj,
  children,
}) => (
  <EuiFlexItem>
    <EuiPanel hasBorder paddingSize="m" data-test-subj={testSubj}>
      <EuiTitle size="xxs">
        <h4>{title}</h4>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText size="s">{children}</EuiText>
    </EuiPanel>
  </EuiFlexItem>
);

/** What to change, for each failing step only. */
export const SetupFixes: React.FC<{ state: InfraState; statuses: SetupStatuses }> = ({
  state,
  statuses,
}) => {
  const k8s = isKubernetes(state);
  const host = isHost(state);
  const both = !k8s && !host;
  return (
    <EuiFlexGroup gutterSize="m" direction="column">
      {statuses.spans === 'missing' && (
        <Fix
          title={t('fix.spans.title', 'Add the platform attributes to the spans')}
          testSubj="setupFixSpans"
        >
          <ul>
            <li>
              <strong>Kubernetes:</strong> <EuiCode>k8s_attributes</EuiCode> (k8sattributes){' '}
              {t(
                'fix.spans.k8s',
                'on the traces pipeline, extracting k8s.namespace.name and the workload name (k8s.deployment.name, statefulset, daemonset), with a k8s.pod.uid pod association. Set k8s.cluster.name with a resource processor.'
              )}
            </li>
            <li>
              <strong>{t('fix.spans.hostsLabel', 'Hosts / EC2:')}</strong>{' '}
              <EuiCode>resource_detection</EuiCode> (resourcedetection){' '}
              {t('fix.spans.hosts', 'on the traces pipeline: ec2, or system with host.id enabled.')}
            </li>
          </ul>
          <EuiText size="xs" color="subdued">
            {t('fix.spans.mapped', 'Platform fields in the traces index (any service): {keys}', {
              keys: state.mappedKeys.length ? state.mappedKeys.join(', ') : 'none',
            })}
          </EuiText>
        </Fix>
      )}
      {statuses.metrics === 'missing' && (
        <Fix
          title={t('fix.metrics.title', 'Send infrastructure metrics with the same attributes')}
          testSubj="setupFixMetrics"
        >
          <ul>
            {(k8s || both) && (
              <li>
                <strong>Kubernetes:</strong> <EuiCode>kubelet_stats</EuiCode> (kubeletstats){' '}
                {t('fix.metrics.kubelet', 'on a DaemonSet (endpoint {endpoint}), and', {
                  endpoint: 'https://${env:K8S_NODE_NAME}:10250',
                })}{' '}
                <EuiCode>k8s_cluster</EuiCode>{' '}
                {t(
                  'fix.metrics.cluster',
                  'on a single-replica Deployment. Run the same k8s_attributes (k8sattributes) on the metrics pipeline so pod metrics carry the workload name.'
                )}
              </li>
            )}
            {(host || both) && (
              <li>
                <strong>{t('fix.metrics.hostsLabel', 'Hosts / EC2:')}</strong>{' '}
                <EuiCode>host_metrics</EuiCode> (hostmetrics){' '}
                {t(
                  'fix.metrics.hosts',
                  'with the same resource_detection (resourcedetection) as the traces pipeline, so host.id matches.'
                )}
              </li>
            )}
          </ul>
        </Fix>
      )}
      {statuses.match === 'missing' && (
        <Fix title={t('fix.match.title', 'Align the attribute values')} testSubj="setupFixMatch">
          <p>
            {t(
              'fix.match.body',
              'Infrastructure metrics exist, but no pod or host has the same cluster, namespace, workload or host.id values as the spans. Check that both pipelines use the same processors.'
            )}
          </p>
        </Fix>
      )}
      {statuses.serviceMap === 'optional' && (
        <Fix
          title={t('fix.serviceMap.title', 'Optional: store the keys on the service map')}
          testSubj="setupFixServiceMap"
        >
          <p>
            <EuiCode>platform_detection.enabled: true</EuiCode>{' '}
            {t(
              'fix.serviceMap.body',
              'on the otel_apm_service_map processor. The tab then reads the keys from the service map instead of scanning recent spans.'
            )}
          </p>
        </Fix>
      )}
    </EuiFlexGroup>
  );
};
