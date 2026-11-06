/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiPanel,
  EuiPopover,
  EuiStat,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { INFRA_PLATFORM_ICON, INFRA_PLATFORM_LABEL } from '../../common/infra_constants';
import {
  InfraPodRow,
  K8sWorkloadScope,
  ServiceInfrastructure,
} from '../../common/types/infra_types';

const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
  i18n.translate(`observability.apm.serviceInfrastructure.${id}`, { defaultMessage, values });

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

/** Kubernetes summary row, over the pods present at the end of the range. */
export const K8sSummary: React.FC<{ pods: InfraPodRow[]; nodes: number; replaced: number }> = ({
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
        description={t('summary.restarts', 'Container restarts (total)')}
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

const WORKLOAD_KIND_LABEL: Record<K8sWorkloadScope['kind'], string> = {
  deployment: 'Deployment',
  statefulset: 'StatefulSet',
  daemonset: 'DaemonSet',
  cronjob: 'CronJob',
  job: 'Job',
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

/** Host ids, inline for a few; for more, "N hosts" with the list in a popover. */
const HostsField: React.FC<{ hostIds: string[]; total: number }> = ({ hostIds, total }) => {
  const [open, setOpen] = useState(false);
  if (hostIds.length <= 3) {
    return (
      <ContextField
        label={t('context.host', '{n, plural, one {Host ID} other {Host IDs}}', {
          n: hostIds.length,
        })}
        value={hostIds.join(', ')}
        testSubj="serviceInfrastructureHosts"
      />
    );
  }
  return (
    <EuiFlexItem grow={false}>
      <EuiPopover
        isOpen={open}
        closePopover={() => setOpen(false)}
        panelPaddingSize="s"
        button={
          <EuiBadge
            color="hollow"
            onClick={() => setOpen((v) => !v)}
            onClickAriaLabel={t('context.showHosts', 'Show host ids')}
            data-test-subj="serviceInfrastructureHosts"
          >
            {t('context.hostCount', 'Hosts: {n}', { n: total })}
          </EuiBadge>
        }
      >
        <EuiText size="xs" style={{ maxHeight: 240, overflowY: 'auto' }}>
          <ul data-test-subj="serviceInfrastructureHostList">
            {hostIds.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </EuiText>
      </EuiPopover>
    </EuiFlexItem>
  );
};

/**
 * What the service was matched to, as labelled chips: platform, cluster, namespace and workload
 * for Kubernetes; platform and host ids for hosts. How it was matched is in the info tip.
 */
export const InfraContext: React.FC<{ state: ServiceInfrastructure }> = ({ state }) => {
  const { scopes, hostIds } = state;
  const k8s = scopes.length > 0;
  const matchedBy = k8s
    ? state.namespaceOnly
      ? t('context.matchedNamespace', 'namespace only (no workload name is known)')
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
  const kinds = uniq(scopes.map((s) => s.kind)) as Array<K8sWorkloadScope['kind']>;
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
          iconType={INFRA_PLATFORM_ICON[state.platform]}
          data-test-subj="serviceInfrastructurePlatform"
        >
          <strong>{INFRA_PLATFORM_LABEL[state.platform]}</strong>
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
        <HostsField hostIds={hostIds} total={state.totalHosts} />
      )}
      <EuiFlexItem grow={false} style={{ marginLeft: 4 }}>
        <EuiIconTip content={tip} type="iInCircle" color="subdued" aria-label={tip} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
