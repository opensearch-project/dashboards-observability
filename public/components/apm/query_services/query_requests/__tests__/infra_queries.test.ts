/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getHostInfraQueries,
  getInfraMetricPresenceQueries,
  getInfraMetricQuery,
  getInfraOtherMetricSources,
  getK8sHpaQueries,
  getK8sNodeQueries,
  getK8sWorkloadQueries,
  getInfraGenericQuery,
  getK8sInfraQueries,
  getK8sPodTableQueries,
  getQueryHostRanking,
  getQueryInfraLabelStyleProbe,
  getQueryK8sServicePods,
  getQueryServiceInfraKeys,
  getQueryServiceMapInfraKeys,
  infraLabel,
  k8sScopeMatchers,
  podKey,
} from '../infra_queries';
import { INFRA_TOP_N } from '../../../common/infra_constants';
import { K8sWorkloadScope } from '../../../common/types/infra_types';

const pricing: K8sWorkloadScope = {
  cluster: 'prod-1',
  namespace: 'retail',
  kind: 'deployment',
  workload: 'pricing',
};

describe('infra_queries', () => {
  const start = new Date('2026-10-30T10:00:00Z');
  const end = new Date('2026-10-30T11:00:00Z');

  describe('getQueryServiceInfraKeys', () => {
    it('aggregates the mapped keys over the spans in the time range', () => {
      const q = getQueryServiceInfraKeys(
        'otel-v1-apm-span-*',
        'pricing',
        ['k8s.namespace.name', 'k8s.deployment.name'],
        start,
        end
      );
      expect(q).toContain("source=otel-v1-apm-span-* | where startTime >= '");
      expect(q).toContain("| where serviceName = 'pricing'");
      expect(q).toContain(
        '| stats count() by `resource.attributes.k8s.namespace.name`, `resource.attributes.k8s.deployment.name`'
      );
      expect(q).not.toContain('head');
    });

    it('filters on the derived environment when given', () => {
      const q = getQueryServiceInfraKeys('idx', 'pricing', ['host.id'], start, end, 'eks:default');
      expect(q).toContain(
        "| where serviceName = 'pricing' and `attributes.derived.environment` = 'eks:default' |"
      );
    });

    it('returns null when none of the keys are mapped', () => {
      expect(getQueryServiceInfraKeys('idx', 'svc', [], start, end)).toBeNull();
    });

    it('escapes the service name', () => {
      expect(getQueryServiceInfraKeys('idx', "o'brien", ['host.id'], start, end)).toContain(
        "'o\\'brien'"
      );
    });
  });

  describe('getQueryServiceMapInfraKeys', () => {
    it('aggregates the platform keys of the service-map nodes in the time range', () => {
      const q = getQueryServiceMapInfraKeys(
        'otel-v2-apm-service-map-*',
        'pricing',
        'prod',
        ['apm.platform', 'k8s.cluster.name'],
        start,
        end
      );
      expect(q).toContain("| where timestamp >= '");
      expect(q).toContain(
        "| where sourceNode.keyAttributes.name = 'pricing' and sourceNode.keyAttributes.environment = 'prod'"
      );
      expect(q).toContain(
        '| stats count() by `sourceNode.keyAttributes.apm.platform`, `sourceNode.keyAttributes.k8s.cluster.name`'
      );
    });

    it('returns null when Data Prepper platform detection wrote no keys (apm.platform unmapped)', () => {
      expect(
        getQueryServiceMapInfraKeys('idx', 'svc', 'env', ['k8s.cluster.name'], start, end)
      ).toBeNull();
    });
  });

  describe('infraLabel', () => {
    it.each([
      ['k8s.pod.name', 'plain', 'k8s_pod_name'],
      ['k8s.pod.name', 'resource', 'resource_k8s_pod_name'],
      ['host.id', 'plain', 'host_id'],
    ] as const)('maps %s in %s style to %s', (attr, style, label) => {
      expect(infraLabel(attr, style)).toBe(label);
    });
  });

  it("probes each label style on the service's own workloads or hosts, over the whole range", () => {
    // The newest sample's timestamp in the range: a gap at the range end doesn't hide the data.
    expect(
      getQueryInfraLabelStyleProbe('resource', { scopes: [pricing], hostIds: [] }, 28800)
    ).toBe(
      'max(max_over_time(timestamp((k8s_pod_memory_working_set_bytes{resource_k8s_cluster_name="prod-1",resource_k8s_namespace_name="retail",resource_k8s_deployment_name="pricing"}))[28800s:60s]))'
    );
    expect(
      getQueryInfraLabelStyleProbe('plain', { scopes: [], hostIds: ['i-1', 'i.2'] }, 604800)
    ).toBe(
      'max(max_over_time(timestamp(system_cpu_time_seconds_total{host_id=~"i-1|i\\\\.2"})[604800s:1210s]))'
    );
  });

  describe('k8sScopeMatchers', () => {
    it('matches cluster, namespace and the workload label of its kind', () => {
      expect(k8sScopeMatchers(pricing, 'plain')).toBe(
        'k8s_cluster_name="prod-1",k8s_namespace_name="retail",k8s_deployment_name="pricing"'
      );
      expect(
        k8sScopeMatchers({ namespace: 'shop', kind: 'statefulset', workload: 'db' }, 'resource')
      ).toBe('resource_k8s_namespace_name="shop",resource_k8s_statefulset_name="db"');
    });

    it('matches only cluster and namespace for the namespace fallback', () => {
      expect(
        k8sScopeMatchers(
          { cluster: 'c1', namespace: 'shop', kind: 'namespace', workload: '' },
          'plain'
        )
      ).toBe('k8s_cluster_name="c1",k8s_namespace_name="shop"');
    });

    it('escapes label values', () => {
      expect(
        k8sScopeMatchers({ namespace: 'a"b', kind: 'deployment', workload: 'w' }, 'plain')
      ).toContain('k8s_namespace_name="a\\"b"');
    });
  });

  it('lists the pods of every scope, joined with or', () => {
    const q = getQueryK8sServicePods(
      [pricing, { ...pricing, workload: 'pricing-canary' }],
      'plain'
    );
    expect(q).toContain('k8s_deployment_name="pricing"}');
    expect(q).toContain(' or k8s_pod_memory_working_set_bytes{');
    expect(q).toContain('k8s_deployment_name="pricing-canary"}');
    expect(
      q.startsWith('max by (k8s_cluster_name, k8s_namespace_name, k8s_pod_name, k8s_node_name)')
    ).toBe(true);
  });

  describe('getK8sInfraQueries', () => {
    const pods = [
      { cluster: 'prod-1', namespace: 'retail', pod: 'pricing-a' },
      { cluster: 'prod-1', namespace: 'retail', pod: 'pricing-b' },
    ];
    const q = getK8sInfraQueries(pods, 'plain');
    const byPod = 'k8s_cluster_name, k8s_namespace_name, k8s_pod_name';

    it('charts only the given pods, aggregated by cluster, namespace and pod', () => {
      expect(q.cpu).toContain(
        `sum by (${byPod}) (container_cpu_usage{k8s_cluster_name="prod-1",k8s_namespace_name="retail",k8s_pod_name=~"pricing-a|pricing-b"})`
      );
      expect(q.cpu).toContain(
        'k8s_container_cpu_limit{k8s_cluster_name="prod-1",k8s_namespace_name="retail",k8s_pod_name=~"pricing-a|pricing-b"}'
      );
      // The chart pods are picked once (top N by CPU), so no per-step topk.
      expect(q.cpu).not.toContain('topk');
      expect(q.podLabel).toBe('k8s_pod_name');
    });

    it('falls back to the CPU request when there is no limit', () => {
      expect(q.cpu).toContain('"request"');
      expect(q.cpu).toContain(
        `unless on() max(sum by (${byPod}) (max by (${byPod}, k8s_container_name) (k8s_container_cpu_limit{`
      );
    });

    it('sums restarts over containers, and rates network per selector', () => {
      expect(q.restarts.startsWith(`sum by (${byPod}) (k8s_container_restarts{`)).toBe(true);
      expect(q.network).toBe(
        'sum by (direction) (rate(k8s_pod_network_io_bytes_total{k8s_cluster_name="prod-1",k8s_namespace_name="retail",k8s_pod_name=~"pricing-a|pricing-b"}[2m]))'
      );
    });

    it('selects pods per cluster and namespace, so equal pod names stay apart', () => {
      const r = getK8sInfraQueries(
        [
          { cluster: 'a', namespace: 'shop', pod: 'db-0' },
          { cluster: 'b', namespace: 'shop', pod: 'db-0' },
        ],
        'plain'
      );
      expect(r.memory).toContain(
        'k8s_cluster_name="a",k8s_namespace_name="shop",k8s_pod_name=~"db-0"'
      );
      expect(r.memory).toContain(
        ' or container_memory_working_set_bytes{k8s_cluster_name="b",k8s_namespace_name="shop",k8s_pod_name=~"db-0"}'
      );
    });

    it('escapes regex characters in pod names', () => {
      const r = getK8sInfraQueries([{ namespace: 'n', pod: 'a.b' }], 'plain');
      expect(r.restarts).toContain('k8s_pod_name=~"a\\\\.b"');
    });
  });

  it('builds the pod table queries per pod, keyed by cluster, namespace and pod', () => {
    const q = getK8sPodTableQueries([{ namespace: 'retail', pod: 'p' }], 'resource');
    expect(q.phase).toBe(
      // The Data Prepper prometheus sink writes `k8s_pod_phase_`, the collector `k8s_pod_phase`.
      'max by (resource_k8s_cluster_name, resource_k8s_namespace_name, resource_k8s_pod_name) ({__name__=~"k8s_pod_phase_?",resource_k8s_namespace_name="retail",resource_k8s_pod_name=~"p"})'
    );
    expect(q.keyLabels).toEqual({
      cluster: 'resource_k8s_cluster_name',
      namespace: 'resource_k8s_namespace_name',
      pod: 'resource_k8s_pod_name',
    });
    expect(podKey({ cluster: 'c', namespace: 'n', pod: 'p' })).toBe('c|n|p');
    expect(podKey({ namespace: 'n', pod: 'p' })).toBe('|n|p');
  });

  it('builds host queries on host.id', () => {
    const q = getHostInfraQueries(['i-1', 'i-2'], 'plain');
    expect(q.cpu).toContain('system_cpu_time_seconds_total{host_id=~"i-1|i-2",state="idle"}');
    expect(q.network).toContain('device!="lo"');
    expect(q.hostLabel).toBe('host_id');
  });
});

describe('pods over the range, top-N and should-have charts', () => {
  const scope: K8sWorkloadScope = {
    cluster: 'c1',
    namespace: 'shop',
    kind: 'statefulset',
    workload: 'db',
  };

  it('lists every pod seen in the range', () => {
    expect(getQueryK8sServicePods([scope], 'plain', 900)).toBe(
      'max by (k8s_cluster_name, k8s_namespace_name, k8s_pod_name, k8s_node_name) ((max_over_time(k8s_pod_memory_working_set_bytes{k8s_cluster_name="c1",k8s_namespace_name="shop",k8s_statefulset_name="db"}[900s])))'
    );
    // At least one minute, so a very short range still finds the pods.
    expect(getQueryK8sServicePods([scope], 'plain', 5)).toContain('[60s]');
  });

  it('ranks hosts once by CPU to pick the charted ones; node charts take no topk', () => {
    expect(getQueryHostRanking(['h1', 'h2'], 'plain')).toBe(
      `topk(${INFRA_TOP_N}, 1 - sum by (host_id) (rate(system_cpu_time_seconds_total{host_id=~"h1|h2",state="idle"}[5m])) / sum by (host_id) (rate(system_cpu_time_seconds_total{host_id=~"h1|h2"}[5m])))`
    );
    expect(getK8sNodeQueries(['n1'], 'plain').memory).not.toContain('topk');
  });

  it('reads node readiness under both metric names', () => {
    const ready = getK8sNodeQueries(['n1'], 'resource').ready;
    expect(ready).toContain(
      'label_replace(sum({__name__=~"k8s_node_condition_ready_?",resource_k8s_node_name=~"n1"}), "nodes", "ready", "", "")'
    );
    expect(ready).toContain('"nodes", "total"');
  });

  it('builds ready vs desired replicas per workload kind, and none for namespace scopes', () => {
    const w = getK8sWorkloadQueries([scope], 'plain');
    expect(w?.metric).toBe('k8s_statefulset_ready_pods');
    expect(w?.replicas).toContain('label_replace(sum(k8s_statefulset_ready_pods{');
    expect(w?.replicas).toContain('"replicas", "desired"');
    expect(
      getK8sWorkloadQueries([{ namespace: 'shop', kind: 'namespace', workload: '' }], 'plain')
    ).toBeNull();
  });

  it('probes each chart metric scoped to the service', () => {
    const q = getInfraMetricPresenceQueries(
      { scopes: [scope], pods: [{ namespace: 'shop', pod: 'db-0' }], nodes: ['n1'], hostIds: [] },
      'plain'
    );
    expect(Object.keys(q).sort()).toEqual([
      'container_cpu_usage',
      'container_memory_working_set_bytes',
      'k8s_container_restarts',
      'k8s_hpa_current_replicas',
      'k8s_node_condition_ready',
      'k8s_node_cpu_usage',
      'k8s_node_memory_working_set_bytes',
      'k8s_pod_network_io_bytes_total',
      'k8s_statefulset_ready_pods',
    ]);
    expect(q.k8s_container_restarts).toContain('k8s_pod_name=~"db-0"');
    expect(
      Object.keys(
        getInfraMetricPresenceQueries({ scopes: [], pods: [], nodes: [], hostIds: ['h'] }, 'plain')
      )
    ).toHaveLength(7);
  });
});

describe('HPA and other metrics', () => {
  const catalog: K8sWorkloadScope = { namespace: 'shop', kind: 'deployment', workload: 'catalog' };

  it('matches the HPA by its name or its scale target, and skips non-scalable workloads', () => {
    const q = getK8sHpaQueries([catalog], 'plain');
    expect(q?.replicas).toContain(
      'k8s_hpa_current_replicas{k8s_namespace_name="shop",k8s_hpa_name="catalog"}'
    );
    expect(q?.replicas).toContain('k8s_hpa_scaletargetref_name="catalog"');
    expect(q?.replicas).toContain('"replicas", "max"');
    expect(getK8sHpaQueries([{ ...catalog, kind: 'daemonset' }], 'plain')).toBeNull();
  });

  it('finds other metrics in the workload, pod, node and host scopes', () => {
    const sources = getInfraOtherMetricSources(
      { scopes: [catalog], pods: [{ namespace: 'shop', pod: 'c-1' }], nodes: ['n1'], hostIds: [] },
      'plain'
    );
    expect(sources.map((x) => x.matchers)).toEqual([
      'k8s_namespace_name="shop",k8s_deployment_name="catalog"',
      'k8s_namespace_name="shop",k8s_pod_name=~"c-1"',
      '__name__=~"k8s_node_.*",k8s_node_name=~"n1"',
    ]);
    expect(sources[0].query).toBe(
      'count by (metric_name) (label_replace({k8s_namespace_name="shop",k8s_deployment_name="catalog"}, "metric_name", "$1", "__name__", "(.+)"))'
    );
    expect(getInfraMetricQuery('k8s_node_filesystem_usage_bytes', sources[2].matchers)).toBe(
      'k8s_node_filesystem_usage_bytes{k8s_node_name=~"n1"}'
    );
  });

  it('limits generic pod and host charts to the charted pods / hosts', () => {
    const pod = getInfraGenericQuery(
      'container_filesystem_usage',
      'k8s_namespace_name="shop",k8s_deployment_name="catalog"',
      'pod',
      'plain',
      { pods: [{ namespace: 'shop', pod: 'c-1' }] }
    );
    expect(pod).toEqual({
      query:
        'avg by (k8s_cluster_name, k8s_namespace_name, k8s_pod_name) (container_filesystem_usage{k8s_namespace_name="shop",k8s_pod_name=~"c-1"})',
      labelField: 'k8s_pod_name',
    });
    expect(
      getInfraGenericQuery('system_paging_faults_total', 'host_id=~"h1|h2"', 'host', 'plain', {
        hostIds: ['h1'],
      }).query
    ).toBe('sum by (host_id) (rate(system_paging_faults_total{host_id=~"h1"}[2m]))');
    // Nodes: every node of the charted pods, from the source's matchers.
    expect(
      getInfraGenericQuery(
        'k8s_node_uptime',
        '__name__=~"k8s_node_.*",k8s_node_name=~"n1"',
        'node',
        'plain'
      ).query
    ).toBe('avg by (k8s_node_name) (k8s_node_uptime{k8s_node_name=~"n1"})');
  });
});
