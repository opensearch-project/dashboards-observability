/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useReducer } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TimeRange } from '../../common/types/service_types';
import {
  InfraFilterableLabel,
  InfraLabelFilter,
  InfraWarning,
  ServiceInfrastructure as InfraState,
} from '../../common/types/infra_types';
import { INFRA_TOP_N } from '../../common/infra_constants';
import { useServiceInfrastructure } from '../../shared/hooks/use_service_infrastructure';
import { openApmSettings } from '../../shared/utils/navigation_utils';
import { infraLabel } from '../../query_services/query_requests/infra_queries';
import { applyLabelFilters, InfraToolbar, matchesLabelFilter } from './infra_toolbar';
import { buildInfraCharts } from './infra_charts';
import { InfraMetricCard } from './infra_metric_card';
import { InfraContext, K8sSummary } from './infra_summary';
import { InfraPodTable } from './infra_pod_table';
import { infraViewReducer, initialInfraViewState } from './infra_view_state';
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

const WARNING_TEXT: Record<InfraWarning, string> = {
  serviceMap: t(
    'warning.serviceMap',
    "The service map couldn't be read, so the platform keys come from the service's recent spans."
  ),
  podTable: t('warning.podTable', 'Some pod values could not be loaded; they show as "-".'),
  presence: t(
    'warning.presence',
    'Some metrics could not be checked, so their charts are shown even if not collected.'
  ),
  otherMetrics: t(
    'warning.otherMetrics',
    'Some metric sources could not be listed, so a few collected metrics may be missing.'
  ),
  hostRanking: t(
    'warning.hostRanking',
    'Hosts could not be ranked by CPU, so the charts show the first hosts found.'
  ),
};

/** The APM settings lack a data source the tab needs: say so, rather than blame the collector. */
const NotConfigured: React.FC<{ what: 'prometheus' | 'traces' }> = ({ what }) => (
  <EuiCallOut
    iconType="gear"
    title={
      what === 'prometheus'
        ? t('notConfigured.prometheus', 'No Prometheus data source is configured for APM')
        : t('notConfigured.traces', 'No traces dataset is configured for APM')
    }
    data-test-subj="serviceInfrastructureNotConfigured"
  >
    <p>
      {t(
        'notConfigured.body',
        'The Infrastructure tab reads the service from its traces and its infrastructure metrics from Prometheus. Set both in the APM settings.'
      )}
    </p>
    <EuiButton size="s" onClick={() => openApmSettings()} data-test-subj="openApmSettings">
      {t('notConfigured.open', 'Open APM settings')}
    </EuiButton>
  </EuiCallOut>
);

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

/** Notes above the content: data that ends early, namespace-only matching, partial failures. */
const Notices: React.FC<{ state: InfraState }> = ({ state }) => (
  <>
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
            "No workload name is known for this service, so this shows every pod in the namespace, not only this service's. Add k8s.deployment.name (and statefulset / daemonset / cronjob / job) to the k8s_attributes (k8sattributes) extract.metadata on the traces and metrics pipelines, with a k8s.pod.uid pod association."
          )}
        </EuiCallOut>
        <EuiSpacer size="m" />
      </>
    )}
    {state.warnings.length > 0 && (
      <>
        <EuiCallOut
          size="s"
          color="warning"
          iconType="alert"
          title={t('warning.title', 'Some infrastructure data could not be loaded')}
          data-test-subj="serviceInfrastructureWarnings"
        >
          <ul>
            {state.warnings.map((w) => (
              <li key={w}>{WARNING_TEXT[w]}</li>
            ))}
          </ul>
        </EuiCallOut>
        <EuiSpacer size="m" />
      </>
    )}
  </>
);

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
  const [view, dispatch] = useReducer(infraViewReducer, initialInfraViewState);
  const { labelStyle, pods, nodes, hostIds, scopes } = state;
  const k8s = scopes.length > 0;

  const podLabel = labelStyle ? infraLabel('k8s.pod.name', labelStyle) : '';
  const nodeLabel = labelStyle ? infraLabel('k8s.node.name', labelStyle) : '';
  const hostLabel = labelStyle ? infraLabel('host.id', labelStyle) : '';

  const charts = useMemo(() => buildInfraCharts(state), [state]);

  /** Charts after the search and the label filters, in order. */
  const shownCharts = useMemo(() => {
    const needle = view.search.trim().toLowerCase();
    return charts
      .filter(
        (c) =>
          !needle ||
          c.title.toLowerCase().includes(needle) ||
          c.metric.toLowerCase().includes(needle)
      )
      .map((c) => {
        const filters = view.filters.filter((f) => c.filterLabels.includes(f.name));
        return filters.length ? { ...c, query: applyLabelFilters(c.query, filters) } : c;
      });
  }, [charts, view.filters, view.search]);

  const filterableLabels: InfraFilterableLabel[] = useMemo(
    () =>
      k8s
        ? [
            { name: podLabel, values: pods.map((p) => p.pod) },
            { name: nodeLabel, values: nodes },
          ]
        : [{ name: hostLabel, values: hostIds }],
    [k8s, podLabel, nodeLabel, hostLabel, pods, nodes, hostIds]
  );

  const currentPods = useMemo(() => pods.filter((p) => !p.replaced), [pods]);
  const replacedCount = pods.length - currentPods.length;
  const currentNodes = useMemo(
    () => new Set(currentPods.map((p) => p.node).filter(Boolean)).size,
    [currentPods]
  );
  const shownPods = useMemo(
    () =>
      (view.showReplaced ? pods : currentPods).filter((p) =>
        view.filters.every((f: InfraLabelFilter) =>
          f.name === podLabel
            ? matchesLabelFilter(p.pod, f)
            : f.name === nodeLabel
              ? matchesLabelFilter(p.node, f)
              : true
        )
      ),
    [pods, currentPods, view.showReplaced, view.filters, podLabel, nodeLabel]
  );

  if (state.isLoading && state.platform === 'none') {
    return (
      <EuiFlexGroup justifyContent="center" style={{ padding: 40 }}>
        <EuiLoadingSpinner size="xl" />
      </EuiFlexGroup>
    );
  }
  if (state.notConfigured) return <NotConfigured what={state.notConfigured} />;
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
  if (charts.length === 0) {
    return (
      <>
        <Notices state={state} />
        <NotInstrumented state={state} />
      </>
    );
  }

  const chartsLimited = k8s
    ? currentPods.length > INFRA_TOP_N
    : state.totalHosts > state.chartHostIds.length;

  return (
    <div data-test-subj="serviceInfrastructure" style={{ position: 'relative' }}>
      {state.isLoading && (
        // Reloading after a range change: keep the previous view, with a progress bar.
        <EuiProgress size="xs" color="accent" position="absolute" />
      )}
      <EuiSpacer size="s" />
      <InfraContext state={state} />
      <EuiSpacer size="m" />
      <Notices state={state} />

      {k8s && (
        <>
          <K8sSummary pods={currentPods} nodes={currentNodes} replaced={replacedCount} />
          <EuiSpacer size="m" />
          <InfraPodTable
            pods={shownPods}
            listed={view.showReplaced ? pods.length : currentPods.length}
            loaded={pods.length}
            totalPods={state.totalPods}
            replacedCount={replacedCount}
            showReplaced={view.showReplaced}
            onToggleReplaced={() => dispatch({ type: 'toggleReplaced' })}
          />
          <EuiSpacer size="m" />
        </>
      )}
      {!k8s && state.totalHosts > hostIds.length && (
        <>
          <EuiCallOut
            size="s"
            iconType="iInCircle"
            title={t('hosts.capped', 'Showing {shown} of {total} hosts of this service.', {
              shown: hostIds.length,
              total: state.totalHosts,
            })}
            data-test-subj="serviceInfrastructureHostsCapped"
          />
          <EuiSpacer size="m" />
        </>
      )}

      <InfraToolbar
        labels={filterableLabels}
        filters={view.filters}
        onFiltersChange={(filters) => dispatch({ type: 'setFilters', filters })}
        search={view.search}
        onSearchChange={(search) => dispatch({ type: 'setSearch', search })}
        layout={view.layout}
        onLayoutChange={(layout) => dispatch({ type: 'setLayout', layout })}
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
                n: Math.min(view.displayCount, shownCharts.length),
                total: shownCharts.length,
              })}
            </h3>
          </EuiTitle>
          {(chartsLimited || state.totalOtherMetrics > state.otherMetrics.length) && (
            <EuiText size="xs" color="subdued" data-test-subj="serviceInfrastructureChartsLimited">
              {[
                chartsLimited
                  ? k8s
                    ? t('metrics.topPods', 'Charts show the top {n} pods by CPU.', {
                        n: INFRA_TOP_N,
                      })
                    : t('metrics.topHosts', 'Charts show the top {n} hosts by CPU.', {
                        n: state.chartHostIds.length,
                      })
                  : '',
                state.totalOtherMetrics > state.otherMetrics.length
                  ? t(
                      'metrics.otherCapped',
                      '{shown} of {total} other metrics are listed; search to narrow them down.',
                      { shown: state.otherMetrics.length, total: state.totalOtherMetrics }
                    )
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            </EuiText>
          )}
          <EuiSpacer size="xs" />
          <div className={`apmInfraGrid${view.layout === 'rows' ? ' apmInfraGrid--rows' : ''}`}>
            {shownCharts.slice(0, view.displayCount).map((chart) => (
              <InfraMetricCard
                key={chart.id}
                chart={chart}
                missing={chart.tier !== 'other' && state.missingMetrics.includes(chart.metric)}
                timeRange={props.timeRange}
                prometheusConnectionId={props.prometheusConnectionId}
                refreshTrigger={props.refreshTrigger}
                onTimeRangeChange={props.onTimeRangeChange}
              />
            ))}
          </div>
          {view.displayCount < shownCharts.length && (
            <>
              <EuiSpacer size="m" />
              <EuiFlexGroup justifyContent="center">
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    onClick={() => dispatch({ type: 'loadMore' })}
                    data-test-subj="serviceInfrastructureLoadMore"
                  >
                    {t('metrics.loadMore', 'Load more ({displayed} of {total})', {
                      displayed: view.displayCount,
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
