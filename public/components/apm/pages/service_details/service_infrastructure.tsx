/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTableColumn,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCode,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiIcon,
  EuiIconTip,
  EuiInMemoryTable,
  EuiLoadingSpinner,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { PromQLLineChart } from '../../shared/components/promql_line_chart';
import { navigateToExploreMetrics } from '../../shared/utils/navigation_utils';
import { TimeRange } from '../../common/types/service_types';
import {
  InfraPlatform,
  InfraPodRow,
  ServiceInfrastructure as InfraState,
  useServiceInfrastructure,
} from '../../shared/hooks/use_service_infrastructure';
import {
  getHostInfraQueries,
  getK8sInfraQueries,
  getK8sNodeQueries,
  K8sWorkloadScope,
  getInfraGenericQuery,
  isCounterMetric,
  getK8sHpaQueries,
  getK8sWorkloadQueries,
  infraLabel,
  K8sPodRef,
} from '../../query_services/query_requests/infra_queries';
import {
  applyLabelFilters,
  FilterableLabel,
  InfraLayout,
  InfraToolbar,
  LabelFilter,
  matchesLabelFilter,
} from './infra_toolbar';
import { getSetupStatuses, SetupDiagram, SetupFixes } from './service_infrastructure_setup';
import './service_infrastructure.scss';

export interface ServiceInfrastructureProps {
  serviceName: string;
  environment: string;
  timeRange: TimeRange;
  prometheusConnectionId: string;
  refreshTrigger?: number;
  onTimeRangeChange?: (from: string, to: string) => void;
}

const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
  i18n.translate(`observability.apm.serviceInfrastructure.${id}`, { defaultMessage, values });

const PLATFORM_LABEL: Record<InfraPlatform, string> = {
  eks: 'Amazon EKS',
  kubernetes: 'Kubernetes',
  ec2: 'Amazon EC2',
  host: 'Host',
  none: '',
};

const POD_PHASE: Record<number, { label: string; color: string }> = {
  1: { label: 'Pending', color: 'warning' },
  2: { label: 'Running', color: 'success' },
  3: { label: 'Succeeded', color: 'subdued' },
  4: { label: 'Failed', color: 'danger' },
  5: { label: 'Unknown', color: 'subdued' },
};

const formatBytes = (v?: number) => {
  if (v === undefined || Number.isNaN(v)) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  let n = v;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};
const formatCores = (v?: number) =>
  v === undefined || Number.isNaN(v) ? '-' : v < 1 ? `${Math.round(v * 1000)}m` : v.toFixed(2);
const formatCount = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const formatRatio = (v: number) => `${(v * 100).toFixed(1)}%`;
const formatRate = (v: number) => `${formatBytes(v)}/s`;

type ChartType = 'gauge' | 'counter';

/** Badge colours of the Explore metrics page (TYPE_COLORS). */
const TYPE_COLOR: Record<ChartType, string> = { counter: 'primary', gauge: 'success' };

interface InfraChart {
  id: string;
  title: string;
  /** Main metric of the query: shown in the tooltip and matched by the search. */
  metric: string;
  query: string;
  type: ChartType;
  format: (v: number) => string;
  labelField: string;
  /** Labels the query's series carry, so a label filter only narrows charts it applies to. */
  filterLabels: string[];
  testSubj: string;
  /**
   * `should`: optional context (replicas, HPA, node readiness, disk, network errors), hidden when
   * the service has no series for it. Must-have charts show how to collect a missing metric.
   */
  tier?: 'should' | 'other';
}

/** Cards shown at first and added per "Load more", as on the Explore metrics page. */
const INFRA_PAGE_SIZE = 20;

/**
 * Order of the curated charts: the must-haves first (usage vs limit, restarts, network), then
 * the workload and node context. Every other collected metric follows, by name.
 */
const CHART_PRIORITY = [
  'cpu',
  'memory',
  'restarts',
  'network',
  'replicas',
  'hpa',
  'nodeCpu',
  'nodeMemory',
  'nodeReady',
  'hostCpu',
  'hostMemory',
  'hostLoad',
  'hostFs',
  'hostNetwork',
  'hostDisk',
  'hostNetworkErrors',
];

/** Value format for a metric without a curated chart, from its name and type. */
const genericFormat = (metric: string, counter: boolean): ((v: number) => string) => {
  if (/_bytes(_total)?$/.test(metric)) return counter ? formatRate : formatBytes;
  // CPU time rated, or a CPU usage gauge, is in cores.
  if (/cpu.*(_seconds_total|_usage)$/.test(metric)) return formatCores;
  return counter ? (v) => `${formatNumber(v)}/s` : formatNumber;
};

/** A number with enough precision for small values (0.0042, not 0.0). */
const formatNumber = (v: number) =>
  Number.isNaN(v)
    ? '-'
    : Math.abs(v) >= 100 || Number.isInteger(v)
      ? Math.round(v).toLocaleString()
      : Number(v.toPrecision(3)).toString();

/**
 * Mounts its children (and so runs their queries) only once scrolled near the viewport, as the
 * Explore metrics page loads only the cards on screen.
 */
const LazyMount: React.FC<{ height: number }> = ({ height, children }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  React.useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  return visible ? <>{children}</> : <div ref={ref} style={{ height }} />;
};

/** Share of the limit, with the colour the Explore metrics page uses for thresholds. */
const usageColor = (pct: number) => (pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'success');

/** A usage value with a bar against its limit (as Datadog's pod table shows it). */
const UsageCell: React.FC<{ text: string; used?: number; limit?: number }> = ({
  text,
  used,
  limit,
}) => {
  const pct = used !== undefined && limit ? Math.round((used / limit) * 100) : undefined;
  return (
    <div style={{ width: '100%' }}>
      <EuiText size="s">
        {text}
        {pct !== undefined && (
          <EuiText size="xs" color="subdued" component="span">
            {` ${pct}%`}
          </EuiText>
        )}
      </EuiText>
      {pct !== undefined && (
        <EuiProgress value={Math.min(pct, 100)} max={100} size="xs" color={usageColor(pct)} />
      )}
    </div>
  );
};

/** One summary figure (pods running, restarts, CPU and memory of limit). */
const SummaryStat: React.FC<{
  title: string;
  description: string;
  hint?: string;
  color?: string;
  testSubj: string;
}> = ({ title, description, hint, color, testSubj }) => (
  <EuiFlexItem>
    <EuiPanel hasBorder paddingSize="s" data-test-subj={testSubj}>
      <EuiStat title={title} description={description} titleSize="s" titleColor={color} reverse />
      {hint && (
        <EuiText size="xs" color="subdued">
          {hint}
        </EuiText>
      )}
    </EuiPanel>
  </EuiFlexItem>
);

const ofLimitStats = (
  rows: InfraPodRow[],
  used: 'cpu' | 'memory',
  limit: 'cpuLimit' | 'memoryLimit'
) => {
  const pcts = rows
    .filter((r) => r[used] !== undefined && r[limit])
    .map((r) => ((r[used] as number) / (r[limit] as number)) * 100);
  if (pcts.length === 0) return null;
  return {
    avg: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    max: Math.round(Math.max(...pcts)),
  };
};

/** Kubernetes summary row: is the workload healthy and how close is it to its limits. */
const K8sSummary: React.FC<{ pods: InfraPodRow[]; nodes: number; replaced: number }> = ({
  pods,
  nodes,
  replaced,
}) => {
  const running = pods.filter((p) => p.phase === 2).length;
  const restarts = pods.reduce((sum, p) => sum + (p.restarts ?? 0), 0);
  const cpu = ofLimitStats(pods, 'cpu', 'cpuLimit');
  const memory = ofLimitStats(pods, 'memory', 'memoryLimit');
  const pct = (v: { avg: number; max: number } | null) => (v ? `${v.avg}%` : '-');
  const maxHint = (v: { avg: number; max: number } | null) =>
    v ? t('summary.max', 'max {max}%', { max: v.max }) : t('summary.noLimit', 'no limit set');
  return (
    <EuiFlexGroup gutterSize="s" responsive={false} data-test-subj="serviceInfrastructureSummary">
      <SummaryStat
        title={`${running} / ${pods.length}`}
        description={t('summary.running', 'Pods running')}
        hint={
          replaced > 0
            ? t(
                'summary.onNodesReplaced',
                'on {nodes, plural, one {# node} other {# nodes}}; {replaced} replaced in range',
                { nodes, replaced }
              )
            : t('summary.onNodes', 'on {nodes, plural, one {# node} other {# nodes}}', { nodes })
        }
        color={running < pods.length ? 'danger' : 'default'}
        testSubj="serviceInfrastructureSummaryPods"
      />
      <SummaryStat
        title={String(restarts)}
        description={t('summary.restarts', 'Container restarts')}
        color={restarts > 0 ? 'accent' : 'default'}
        testSubj="serviceInfrastructureSummaryRestarts"
      />
      <SummaryStat
        title={pct(cpu)}
        description={t('summary.cpu', 'CPU of limit (avg)')}
        hint={maxHint(cpu)}
        color={cpu && cpu.max >= 90 ? 'danger' : 'default'}
        testSubj="serviceInfrastructureSummaryCpu"
      />
      <SummaryStat
        title={pct(memory)}
        description={t('summary.memory', 'Memory of limit (avg)')}
        hint={maxHint(memory)}
        color={memory && memory.max >= 90 ? 'danger' : 'default'}
        testSubj="serviceInfrastructureSummaryMemory"
      />
    </EuiFlexGroup>
  );
};

/**
 * How to collect each chart's metric, for the card shown when the service has no series for it.
 * Receivers are named with their current and their older (deprecated) component names.
 */
const METRIC_HINTS: Record<string, { source: string; detail: string }> = {
  container_cpu_usage: { source: 'kubelet_stats (kubeletstats)', detail: 'container.cpu.usage' },
  container_memory_working_set_bytes: {
    source: 'kubelet_stats (kubeletstats)',
    detail: 'container.memory.working_set',
  },
  k8s_pod_network_io_bytes_total: {
    source: 'kubelet_stats (kubeletstats)',
    detail: 'k8s.pod.network.io',
  },
  k8s_container_restarts: { source: 'k8s_cluster', detail: 'k8s.container.restarts' },
  k8s_node_cpu_usage: { source: 'kubelet_stats (kubeletstats)', detail: 'k8s.node.cpu.usage' },
  k8s_node_memory_working_set_bytes: {
    source: 'kubelet_stats (kubeletstats)',
    detail: 'k8s.node.memory.working_set',
  },
  k8s_node_condition_ready: {
    source: 'k8s_cluster',
    detail: 'node_conditions_to_report: [Ready]',
  },
  k8s_deployment_available: { source: 'k8s_cluster', detail: 'k8s.deployment.available / desired' },
  k8s_statefulset_ready_pods: {
    source: 'k8s_cluster',
    detail: 'k8s.statefulset.ready_pods / desired_pods',
  },
  k8s_daemonset_ready_nodes: {
    source: 'k8s_cluster',
    detail: 'k8s.daemonset.ready_nodes / desired_scheduled_nodes',
  },
  system_cpu_time_seconds_total: { source: 'host_metrics (hostmetrics)', detail: 'scrapers: cpu' },
  system_memory_usage_bytes: { source: 'host_metrics (hostmetrics)', detail: 'scrapers: memory' },
  system_cpu_load_average_1m: { source: 'host_metrics (hostmetrics)', detail: 'scrapers: load' },
  system_filesystem_usage_bytes: {
    source: 'host_metrics (hostmetrics)',
    detail: 'scrapers: filesystem',
  },
  system_network_io_bytes_total: {
    source: 'host_metrics (hostmetrics)',
    detail: 'scrapers: network',
  },
};

/**
 * One chart, styled like the Explore metrics page's metric card. The title opens the chart's
 * query on the Metrics page. When the service has no series for the chart's metric, the card
 * says how to collect it instead of drawing an empty chart.
 */
const InfraMetricCard: React.FC<{
  chart: InfraChart;
  props: ServiceInfrastructureProps;
  missing?: boolean;
}> = ({ chart, props, missing }) => {
  const header = (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap={false}>
      <EuiFlexItem style={{ minWidth: 0, overflow: 'hidden' }}>
        <EuiToolTip
          content={
            <>
              <strong>{chart.metric}</strong>
              <br />
              {t('card.open', 'Open in Metrics')}
            </>
          }
        >
          <EuiButtonEmpty
            size="xs"
            style={{ maxWidth: '100%' }}
            onClick={() =>
              navigateToExploreMetrics(chart.query, props.prometheusConnectionId, props.timeRange)
            }
            data-test-subj={`${chart.testSubj}Open`}
          >
            <span className="apmInfraCard__title">{chart.title}</span>
          </EuiButtonEmpty>
        </EuiToolTip>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge color={missing ? 'default' : TYPE_COLOR[chart.type]}>
          {missing ? t('card.missingBadge', 'not collected') : chart.type}
        </EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
  if (missing) {
    const hint = METRIC_HINTS[chart.metric];
    return (
      <EuiPanel
        paddingSize="none"
        hasBorder
        className="apmInfraCard apmInfraCard--missing"
        data-test-subj={`${chart.testSubj}Missing`}
      >
        {header}
        <div className="apmInfraCard__hint">
          <EuiIcon type="visLine" color="subdued" size="l" />
          <EuiText size="xs" color="subdued" textAlign="center">
            <p>
              {t('card.missing', 'No {metric} series for this service.', {
                metric: chart.metric,
              })}
              {hint && (
                <>
                  <br />
                  {t('card.collectWith', 'Collect it with')} <EuiCode>{hint.source}</EuiCode>{' '}
                  <EuiCode>{hint.detail}</EuiCode>
                </>
              )}
            </p>
          </EuiText>
        </div>
      </EuiPanel>
    );
  }
  return (
    <EuiPanel paddingSize="none" hasBorder className="apmInfraCard" data-test-subj={chart.testSubj}>
      <LazyMount height={200}>
        <PromQLLineChart
          title={chart.title}
          header={header}
          showOpenInMetrics={false}
          promqlQuery={chart.query}
          timeRange={props.timeRange}
          prometheusConnectionId={props.prometheusConnectionId}
          refreshTrigger={props.refreshTrigger}
          onTimeRangeChange={props.onTimeRangeChange}
          labelField={chart.labelField}
          formatValue={chart.format}
          formatTooltipValue={(v) => chart.format(v)}
          height={160}
        />
      </LazyMount>
    </EuiPanel>
  );
};

const WORKLOAD_KIND_LABEL: Record<K8sWorkloadScope['kind'], string> = {
  deployment: 'Deployment',
  statefulset: 'StatefulSet',
  daemonset: 'DaemonSet',
  namespace: 'Workload',
};

const uniq = (values: Array<string | undefined>) =>
  Array.from(new Set(values.filter((v): v is string => !!v)));

/** One labelled chip of the header (e.g. "Namespace: shop"), as the Metrics page's filter badges. */
const ContextField: React.FC<{ label: string; value: string; testSubj: string }> = ({
  label,
  value,
  testSubj,
}) => (
  <EuiFlexItem grow={false}>
    <EuiBadge color="hollow" data-test-subj={testSubj}>
      {label}: <strong>{value}</strong>
    </EuiBadge>
  </EuiFlexItem>
);

/** Logo for the platform chip. */
const PLATFORM_ICON: Record<InfraPlatform, string> = {
  eks: 'logoAWS',
  ec2: 'logoAWS',
  kubernetes: 'logoKubernetes',
  host: 'compute',
  none: 'compute',
};

/**
 * What the service was matched to, as labelled fields: platform, cluster, namespace and workload
 * for Kubernetes; platform and host ids for hosts. How it was matched is in the info tip.
 */
const InfraContext: React.FC<{ state: InfraState; platformLabel: string }> = ({
  state,
  platformLabel,
}) => {
  const { scopes, hostIds } = state;
  const k8s = scopes.length > 0;
  const matchedBy = k8s
    ? state.namespaceOnly
      ? t('context.matchedNamespace', 'namespace only (the spans carry no workload name)')
      : t('context.matchedWorkload', 'cluster, namespace and workload name')
    : t('context.matchedHost', 'host.id');
  const tip = t(
    'context.tip',
    'Matched on {matchedBy}, read from the {source}. Infrastructure metrics use {labels} labels.',
    {
      matchedBy,
      source:
        state.keySource === 'serviceMap'
          ? t('context.sourceMap', 'service map (Data Prepper platform detection)')
          : t('context.sourceSpans', "service's recent spans"),
      labels: state.labelStyle === 'resource' ? 'resource_*' : 'plain',
    }
  );
  const kinds = uniq(scopes.map((s) => s.kind));
  return (
    <EuiFlexGroup
      gutterSize="xs"
      alignItems="center"
      wrap
      responsive={false}
      data-test-subj="serviceInfrastructureContext"
    >
      <EuiFlexItem grow={false}>
        <EuiBadge
          color="hollow"
          iconType={PLATFORM_ICON[state.platform]}
          data-test-subj="serviceInfrastructurePlatform"
        >
          <strong>{platformLabel}</strong>
        </EuiBadge>
      </EuiFlexItem>
      {k8s ? (
        <>
          {uniq(scopes.map((s) => s.cluster)).length > 0 && (
            <ContextField
              label={t('context.cluster', 'Cluster')}
              value={uniq(scopes.map((s) => s.cluster)).join(', ')}
              testSubj="serviceInfrastructureCluster"
            />
          )}
          <ContextField
            label={t('context.namespace', 'Namespace')}
            value={uniq(scopes.map((s) => s.namespace)).join(', ')}
            testSubj="serviceInfrastructureNamespace"
          />
          <ContextField
            label={
              kinds.length === 1 ? WORKLOAD_KIND_LABEL[kinds[0]] : t('context.workload', 'Workload')
            }
            value={
              state.namespaceOnly
                ? t('scope.allWorkloads', 'all workloads')
                : uniq(scopes.map((s) => s.workload)).join(', ')
            }
            testSubj="serviceInfrastructureWorkload"
          />
        </>
      ) : (
        <>
          <ContextField
            label={t('context.host', '{n, plural, one {Host ID} other {Host IDs}}', {
              n: hostIds.length,
            })}
            value={hostIds.join(', ')}
            testSubj="serviceInfrastructureHosts"
          />
        </>
      )}
      <EuiFlexItem grow={false} style={{ marginLeft: 4 }}>
        <EuiIconTip content={tip} type="iInCircle" color="subdued" aria-label={tip} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

/** Empty state: the data path as a diagram, with what to change at the step that fails. */
const NotInstrumented: React.FC<{ state: InfraState }> = ({ state }) => {
  const statuses = getSetupStatuses(state);
  const keysFound = statuses.spans === 'ok';
  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="serviceInfrastructureEmpty">
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="compute" size="l" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>
              {keysFound
                ? t('noMetrics.title', 'No infrastructure metrics found for this service')
                : t('notInstrumented.title', 'Infrastructure is not instrumented for this service')}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <p>
          {t(
            'notInstrumented.body',
            'This tab joins a service to its pods or hosts on the resource attributes that its spans and the infrastructure metrics share. The step marked in yellow is where the link breaks.'
          )}
        </p>
      </EuiText>
      <EuiSpacer size="m" />
      <SetupDiagram state={state} statuses={statuses} />
      <EuiSpacer size="l" />
      <SetupFixes state={state} statuses={statuses} />
    </EuiPanel>
  );
};

const podColumns: Array<EuiBasicTableColumn<InfraPodRow>> = [
  { field: 'pod', name: t('pods.pod', 'Pod'), sortable: true, truncateText: true },
  { field: 'node', name: t('pods.node', 'Node'), sortable: true, truncateText: true },
  {
    field: 'phase',
    name: t('pods.phase', 'Phase'),
    render: (phase: number | undefined, row: InfraPodRow) => {
      if (row.replaced) {
        return <EuiHealth color="subdued">{t('pods.replaced', 'Replaced')}</EuiHealth>;
      }
      const p = phase !== undefined ? POD_PHASE[phase] : undefined;
      return p ? <EuiHealth color={p.color}>{p.label}</EuiHealth> : '-';
    },
  },
  {
    field: 'cpu',
    name: t('pods.cpu', 'CPU (of limit)'),
    sortable: true,
    render: (cpu: number | undefined, row: InfraPodRow) => (
      <UsageCell text={formatCores(cpu)} used={cpu} limit={row.cpuLimit} />
    ),
  },
  {
    field: 'memory',
    name: t('pods.memory', 'Memory (of limit)'),
    sortable: true,
    render: (mem: number | undefined, row: InfraPodRow) => (
      <UsageCell text={formatBytes(mem)} used={mem} limit={row.memoryLimit} />
    ),
  },
  {
    field: 'restarts',
    name: t('pods.restarts', 'Restarts'),
    sortable: true,
    render: (r?: number) =>
      r === undefined ? '-' : r > 0 ? <EuiBadge color="warning">{r}</EuiBadge> : r,
  },
];

/**
 * Infrastructure tab of the service details page: the pods / nodes or hosts the service
 * runs on, matched on the resource attributes its spans and the infra metrics share
 * (RFC opensearch-project/dashboards-observability#2940).
 */
export const ServiceInfrastructure: React.FC<ServiceInfrastructureProps> = (props) => {
  const state = useServiceInfrastructure(
    props.serviceName,
    props.environment,
    props.timeRange,
    props.refreshTrigger
  );
  const { labelStyle, scopes, pods, nodes, hostIds, platform } = state;

  const refs: K8sPodRef[] = useMemo(
    () => pods.map(({ cluster, namespace, pod }) => ({ cluster, namespace, pod })),
    [pods]
  );
  const k8s = useMemo(
    () =>
      labelStyle && scopes.length && refs.length
        ? getK8sInfraQueries(scopes, refs, labelStyle)
        : null,
    [scopes, refs, labelStyle]
  );
  const hpaQueries = useMemo(
    () => (k8s && labelStyle ? getK8sHpaQueries(scopes, labelStyle) : null),
    [k8s, scopes, labelStyle]
  );
  const workloadQueries = useMemo(
    () => (k8s && labelStyle ? getK8sWorkloadQueries(scopes, labelStyle) : null),
    [k8s, scopes, labelStyle]
  );
  const nodeQueries = useMemo(
    () => (labelStyle && nodes.length ? getK8sNodeQueries(nodes, labelStyle) : null),
    [nodes, labelStyle]
  );
  const host = useMemo(
    () => (labelStyle && hostIds.length ? getHostInfraQueries(hostIds, labelStyle) : null),
    [hostIds, labelStyle]
  );

  const [layout, setLayout] = useState<InfraLayout>('grid');
  const [displayCount, setDisplayCount] = useState(INFRA_PAGE_SIZE * 2);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<LabelFilter[]>([]);

  const podLabel = labelStyle ? infraLabel('k8s.pod.name', labelStyle) : '';
  const nodeLabel = labelStyle ? infraLabel('k8s.node.name', labelStyle) : '';
  const hostLabel = labelStyle ? infraLabel('host.id', labelStyle) : '';

  const charts: InfraChart[] = useMemo(() => {
    const out: InfraChart[] = [];
    const pod = [podLabel, nodeLabel];
    if (k8s) {
      out.push(
        {
          id: 'cpu',
          title: t('charts.cpu', 'CPU usage (cores) vs limit'),
          metric: 'container_cpu_usage',
          query: k8s.cpu,
          type: 'gauge',
          format: formatCores,
          labelField: k8s.podLabel,
          filterLabels: pod,
          testSubj: 'infraChartCpu',
        },
        {
          id: 'memory',
          title: t('charts.memory', 'Memory working set vs limit'),
          metric: 'container_memory_working_set_bytes',
          query: k8s.memory,
          type: 'gauge',
          format: formatBytes,
          labelField: k8s.podLabel,
          filterLabels: pod,
          testSubj: 'infraChartMemory',
        },
        {
          id: 'restarts',
          title: t('charts.restarts', 'Container restarts'),
          metric: 'k8s_container_restarts',
          query: k8s.restarts,
          type: 'counter',
          format: formatCount,
          labelField: k8s.podLabel,
          filterLabels: pod,
          testSubj: 'infraChartRestarts',
        },
        {
          id: 'network',
          title: t('charts.network', 'Pod network'),
          metric: 'k8s_pod_network_io_bytes_total',
          query: k8s.network,
          type: 'counter',
          format: formatRate,
          labelField: 'direction',
          filterLabels: pod,
          testSubj: 'infraChartNetwork',
        }
      );
    }
    if (k8s && nodeQueries) {
      out.push(
        {
          id: 'nodeCpu',
          title: t('charts.nodeCpu', 'Node CPU usage (cores)'),
          metric: 'k8s_node_cpu_usage',
          query: nodeQueries.cpu,
          type: 'gauge',
          format: formatCores,
          labelField: nodeQueries.nodeLabel,
          filterLabels: [nodeLabel],
          testSubj: 'infraChartNodeCpu',
        },
        {
          id: 'nodeMemory',
          title: t('charts.nodeMemory', 'Node memory working set'),
          metric: 'k8s_node_memory_working_set_bytes',
          query: nodeQueries.memory,
          type: 'gauge',
          format: formatBytes,
          labelField: nodeQueries.nodeLabel,
          filterLabels: [nodeLabel],
          testSubj: 'infraChartNodeMemory',
        },
        {
          id: 'nodeReady',
          title: t('charts.nodeReady', 'Nodes ready vs total'),
          metric: 'k8s_node_condition_ready',
          query: nodeQueries.ready,
          type: 'gauge',
          format: formatCount,
          labelField: 'nodes',
          filterLabels: [nodeLabel],
          testSubj: 'infraChartNodeReady',
          tier: 'should',
        }
      );
    }
    if (workloadQueries) {
      out.push({
        id: 'replicas',
        title: t('charts.replicas', 'Replicas ready vs desired'),
        metric: workloadQueries.metric,
        query: workloadQueries.replicas,
        type: 'gauge',
        format: formatCount,
        labelField: 'replicas',
        filterLabels: [],
        testSubj: 'infraChartReplicas',
        tier: 'should',
      });
    }
    if (hpaQueries) {
      out.push({
        id: 'hpa',
        title: t('charts.hpa', 'Autoscaler replicas vs max'),
        metric: 'k8s_hpa_current_replicas',
        query: hpaQueries.replicas,
        type: 'gauge',
        format: formatCount,
        labelField: 'replicas',
        filterLabels: [],
        testSubj: 'infraChartHpa',
        tier: 'should',
      });
    }
    if (host) {
      const h = [hostLabel];
      out.push(
        {
          id: 'hostCpu',
          title: t('charts.hostCpu', 'CPU utilization'),
          metric: 'system_cpu_time_seconds_total',
          query: host.cpu,
          type: 'counter',
          format: formatRatio,
          labelField: host.hostLabel,
          filterLabels: h,
          testSubj: 'infraChartHostCpu',
        },
        {
          id: 'hostMemory',
          title: t('charts.hostMemory', 'Memory used'),
          metric: 'system_memory_usage_bytes',
          query: host.memory,
          type: 'gauge',
          format: formatRatio,
          labelField: host.hostLabel,
          filterLabels: h,
          testSubj: 'infraChartHostMemory',
        },
        {
          id: 'hostLoad',
          title: t('charts.hostLoad', 'Load average (1m)'),
          metric: 'system_cpu_load_average_1m',
          query: host.load,
          type: 'gauge',
          format: (v) => v.toFixed(2),
          labelField: host.hostLabel,
          filterLabels: h,
          testSubj: 'infraChartHostLoad',
        },
        {
          id: 'hostFs',
          title: t('charts.hostFs', 'Filesystem used'),
          metric: 'system_filesystem_usage_bytes',
          query: host.filesystem,
          type: 'gauge',
          format: formatRatio,
          labelField: host.hostLabel,
          filterLabels: h,
          testSubj: 'infraChartHostFilesystem',
        },
        {
          id: 'hostNetwork',
          title: t('charts.hostNetwork', 'Network'),
          metric: 'system_network_io_bytes_total',
          query: host.network,
          type: 'counter',
          format: formatRate,
          labelField: 'direction',
          filterLabels: h,
          testSubj: 'infraChartHostNetwork',
        },
        {
          id: 'hostDisk',
          title: t('charts.hostDisk', 'Disk I/O'),
          metric: 'system_disk_io_bytes_total',
          query: host.diskIo,
          type: 'counter',
          format: formatRate,
          labelField: 'direction',
          filterLabels: h,
          testSubj: 'infraChartHostDisk',
          tier: 'should',
        },
        {
          id: 'hostNetworkErrors',
          title: t('charts.hostNetworkErrors', 'Network errors and drops'),
          metric: 'system_network_errors_total',
          query: host.networkErrors,
          type: 'counter',
          format: (v) => `${v.toFixed(2)}/s`,
          labelField: 'kind',
          filterLabels: h,
          testSubj: 'infraChartHostNetworkErrors',
          tier: 'should',
        }
      );
    }
    return out;
  }, [k8s, nodeQueries, workloadQueries, hpaQueries, host, podLabel, nodeLabel, hostLabel]);

  /**
   * Every chart in order: the curated ones by priority (optional ones the service has no series
   * for left out), then every other metric collected for the service, by name.
   */
  const available = useMemo(() => {
    const curated = charts
      .filter((c) => !(c.tier === 'should' && state.missingMetrics.includes(c.metric)))
      .sort((a, b) => CHART_PRIORITY.indexOf(a.id) - CHART_PRIORITY.indexOf(b.id));
    const others: InfraChart[] = labelStyle
      ? state.otherMetrics.map((m) => {
          const counter = isCounterMetric(m.name);
          const { query, labelField } = getInfraGenericQuery(
            m.name,
            m.matchers,
            m.kind,
            labelStyle
          );
          return {
            id: `other-${m.name}`,
            title: m.name,
            metric: m.name,
            query,
            type: counter ? 'counter' : 'gauge',
            format: genericFormat(m.name, counter),
            labelField,
            filterLabels:
              m.kind === 'host'
                ? [hostLabel]
                : m.kind === 'node'
                  ? [nodeLabel]
                  : [podLabel, nodeLabel],
            testSubj: `infraChartOther-${m.name}`,
            tier: 'other' as const,
          };
        })
      : [];
    return [...curated, ...others];
  }, [
    charts,
    state.missingMetrics,
    state.otherMetrics,
    labelStyle,
    podLabel,
    nodeLabel,
    hostLabel,
  ]);

  /** Charts after the search and the label filters, in order. */
  const shownCharts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return available
      .filter(
        (c) =>
          !needle ||
          c.title.toLowerCase().includes(needle) ||
          c.metric.toLowerCase().includes(needle)
      )
      .map((c) => ({
        ...c,
        query: applyLabelFilters(
          c.query,
          filters.filter((f) => c.filterLabels.includes(f.name))
        ),
      }));
  }, [available, filters, search]);

  const filterableLabels: FilterableLabel[] = useMemo(
    () =>
      k8s
        ? [
            { name: podLabel, values: pods.map((p) => p.pod) },
            { name: nodeLabel, values: nodes },
          ]
        : [{ name: hostLabel, values: hostIds }],
    [k8s, podLabel, nodeLabel, hostLabel, pods, nodes, hostIds]
  );

  const [showReplaced, setShowReplaced] = useState(false);
  const currentPods = useMemo(() => pods.filter((p) => !p.replaced), [pods]);
  const replacedCount = pods.length - currentPods.length;
  const currentNodes = useMemo(
    () => new Set(currentPods.map((p) => p.node).filter(Boolean)).size,
    [currentPods]
  );
  const shownPods = useMemo(
    () =>
      (showReplaced ? pods : currentPods).filter((p) =>
        filters.every((f) =>
          f.name === podLabel
            ? matchesLabelFilter(p.pod, f)
            : f.name === nodeLabel
              ? matchesLabelFilter(p.node, f)
              : true
        )
      ),
    [pods, currentPods, showReplaced, filters, podLabel, nodeLabel]
  );

  if (state.isLoading && platform === 'none') {
    return (
      <EuiFlexGroup justifyContent="center" style={{ padding: 40 }}>
        <EuiLoadingSpinner size="xl" />
      </EuiFlexGroup>
    );
  }
  if (state.error) {
    return (
      <EuiCallOut
        color="danger"
        iconType="alert"
        title={t('error.title', 'Could not load infrastructure')}
        data-test-subj="serviceInfrastructureError"
      >
        {state.error.message}
      </EuiCallOut>
    );
  }
  if (!k8s && !host) {
    return <NotInstrumented state={state} />;
  }

  return (
    <div data-test-subj="serviceInfrastructure">
      <EuiSpacer size="s" />
      <InfraContext state={state} platformLabel={PLATFORM_LABEL[platform]} />
      <EuiSpacer size="m" />
      {state.dataEndsAt && (
        <>
          <EuiCallOut
            size="s"
            iconType="clock"
            title={t(
              'dataEnds.title',
              'No infrastructure data after {time} in this range. Values are as of then.',
              { time: new Date(state.dataEndsAt * 1000).toLocaleString() }
            )}
            data-test-subj="serviceInfrastructureDataEnds"
          />
          <EuiSpacer size="m" />
        </>
      )}
      {state.namespaceOnly && (
        <>
          <EuiCallOut
            size="s"
            color="warning"
            iconType="alert"
            title={t('namespaceOnly.title', 'Matched by namespace only')}
            data-test-subj="serviceInfrastructureNamespaceOnly"
          >
            {t(
              'namespaceOnly.body',
              "The service's spans carry no workload name, so this shows every pod in the namespace, not only this service's. Add k8s.deployment.name (and statefulset / daemonset / job) to the k8s_attributes (k8sattributes) extract.metadata on the traces and metrics pipelines, with a k8s.pod.uid pod association."
            )}
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {k8s && (
        <>
          <K8sSummary pods={currentPods} nodes={currentNodes} replaced={replacedCount} />
          <EuiSpacer size="m" />
        </>
      )}

      {k8s && (
        <>
          <EuiPanel hasBorder>
            <EuiTitle size="xs">
              <h3>
                {t('pods.title', 'Pods ({shown} of {total})', {
                  shown: shownPods.length,
                  total: showReplaced ? pods.length : currentPods.length,
                })}
              </h3>
            </EuiTitle>
            {replacedCount > 0 && (
              <EuiButtonEmpty
                size="xs"
                flush="left"
                onClick={() => setShowReplaced((v) => !v)}
                data-test-subj="serviceInfrastructureShowReplaced"
              >
                {showReplaced
                  ? t('pods.hideReplaced', 'Hide replaced pods')
                  : t('pods.showReplaced', 'Show {n} pods replaced in this range', {
                      n: replacedCount,
                    })}
              </EuiButtonEmpty>
            )}
            <EuiSpacer size="s" />
            <EuiInMemoryTable
              items={shownPods}
              columns={podColumns}
              sorting={{ sort: { field: 'cpu', direction: 'desc' } }}
              pagination={{ initialPageSize: 10, pageSizeOptions: [10, 25, 50] }}
              tableLayout="auto"
              data-test-subj="serviceInfrastructurePods"
            />
          </EuiPanel>
          <EuiSpacer size="m" />
        </>
      )}

      <InfraToolbar
        labels={filterableLabels}
        filters={filters}
        onFiltersChange={setFilters}
        search={search}
        onSearchChange={setSearch}
        layout={layout}
        onLayoutChange={setLayout}
      />
      <EuiSpacer size="m" />
      {shownCharts.length === 0 ? (
        <EuiText size="s" color="subdued" data-test-subj="serviceInfrastructureNoCharts">
          <p>{t('noCharts', 'No metrics match the search.')}</p>
        </EuiText>
      ) : (
        <div data-test-subj="serviceInfrastructureMetrics">
          <EuiTitle size="xxs">
            <h3>
              {t('metrics.count', 'Metrics ({n} of {total})', {
                n: Math.min(displayCount, shownCharts.length),
                total: shownCharts.length,
              })}
            </h3>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <div className={`apmInfraGrid${layout === 'rows' ? ' apmInfraGrid--rows' : ''}`}>
            {shownCharts.slice(0, displayCount).map((chart) => (
              <InfraMetricCard
                key={chart.id}
                chart={chart}
                props={props}
                missing={chart.tier !== 'other' && state.missingMetrics.includes(chart.metric)}
              />
            ))}
          </div>
          {displayCount < shownCharts.length && (
            <>
              <EuiSpacer size="m" />
              <EuiFlexGroup justifyContent="center">
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    onClick={() => setDisplayCount((c) => c + INFRA_PAGE_SIZE)}
                    data-test-subj="serviceInfrastructureLoadMore"
                  >
                    {t('metrics.loadMore', 'Load more ({displayed} of {total})', {
                      displayed: displayCount,
                      total: shownCharts.length,
                    })}
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
            </>
          )}
        </div>
      )}
    </div>
  );
};
