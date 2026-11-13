/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

jest.mock('../../../config/apm_config_context', () => ({ useApmConfig: () => ({ config: null }) }));

import { keyRowsFromServiceMap, splitK8sScope, toInfraKeys } from '../use_service_infrastructure';

const row = (attrs: Record<string, string | null>) =>
  Object.fromEntries(Object.entries(attrs).map(([k, v]) => [`resource.attributes.${k}`, v]));

describe('toInfraKeys', () => {
  it('reads Kubernetes workload scopes and detects EKS', () => {
    const r = toInfraKeys([
      row({
        'cloud.platform': 'aws_eks',
        'k8s.cluster.name': 'prod-1',
        'k8s.namespace.name': 'retail',
        'k8s.deployment.name': 'pricing',
      }),
    ]);
    expect(r.platform).toBe('eks');
    expect(r.scopes).toEqual([
      { cluster: 'prod-1', namespace: 'retail', kind: 'deployment', workload: 'pricing' },
    ]);
  });

  it('keeps every distinct scope (multi-cluster, canary)', () => {
    const r = toInfraKeys([
      row({
        'k8s.namespace.name': 'shop',
        'k8s.deployment.name': 'checkout',
        'k8s.cluster.name': 'a',
      }),
      row({
        'k8s.namespace.name': 'shop',
        'k8s.deployment.name': 'checkout',
        'k8s.cluster.name': 'b',
      }),
      row({
        'k8s.namespace.name': 'shop',
        'k8s.deployment.name': 'checkout-canary',
        'k8s.cluster.name': 'a',
      }),
      row({
        'k8s.namespace.name': 'shop',
        'k8s.deployment.name': 'checkout',
        'k8s.cluster.name': 'a',
      }),
    ]);
    expect(r.platform).toBe('kubernetes');
    expect(r.scopes).toHaveLength(3);
  });

  it('uses the StatefulSet name when there is no Deployment', () => {
    const r = toInfraKeys([
      row({
        'k8s.namespace.name': 'shop',
        'k8s.deployment.name': null,
        'k8s.statefulset.name': 'db',
      }),
    ]);
    expect(r.scopes[0]).toMatchObject({ kind: 'statefulset', workload: 'db' });
  });

  it('reads hosts outside Kubernetes and detects EC2', () => {
    const r = toInfraKeys([
      row({ 'host.id': 'i-1', 'cloud.platform': 'aws_ec2' }),
      row({ 'host.id': 'i-2' }),
    ]);
    expect(r.platform).toBe('ec2');
    expect(r.hostIds).toEqual(['i-1', 'i-2']);
  });

  it('falls back to namespace-only scopes when no span carries a workload name', () => {
    const r = toInfraKeys([row({ 'k8s.namespace.name': 'shop', 'k8s.cluster.name': 'c1' })]);
    expect(r.platform).toBe('kubernetes');
    expect(r.namespaceOnly).toBe(true);
    expect(r.scopes).toEqual([
      { cluster: 'c1', namespace: 'shop', kind: 'namespace', workload: '' },
    ]);
  });

  it('prefers workload scopes over the namespace fallback', () => {
    const r = toInfraKeys([
      row({ 'k8s.namespace.name': 'shop' }),
      row({ 'k8s.namespace.name': 'shop', 'k8s.deployment.name': 'checkout' }),
    ]);
    expect(r.namespaceOnly).toBe(false);
    expect(r.scopes).toEqual([
      { cluster: undefined, namespace: 'shop', kind: 'deployment', workload: 'checkout' },
    ]);
  });

  it('reports none when nothing matches', () => {
    expect(toInfraKeys([]).platform).toBe('none');
  });
});

describe('keyRowsFromServiceMap', () => {
  const statsRow = (attrs: Record<string, string | null>) =>
    Object.fromEntries(Object.entries(attrs).map(([k, v]) => [`sourceNode.keyAttributes.${k}`, v]));

  it('maps service-map stats rows to scopes, one per distinct combination (multi-cluster)', () => {
    const { rows, detectionEnabled } = keyRowsFromServiceMap([
      statsRow({
        'apm.platform': 'eks',
        'cloud.platform': 'aws_eks',
        'k8s.cluster.name': 'a',
        'k8s.namespace.name': 'shop',
        'k8s.deployment.name': 'checkout',
      }),
      statsRow({
        'apm.platform': 'eks',
        'cloud.platform': 'aws_eks',
        'k8s.cluster.name': 'b',
        'k8s.namespace.name': 'shop',
        'k8s.deployment.name': 'checkout',
      }),
    ]);
    expect(detectionEnabled).toBe(true);
    const keys = toInfraKeys(rows);
    expect(keys.platform).toBe('eks');
    expect(keys.scopes.map((x) => x.cluster).sort()).toEqual(['a', 'b']);
  });

  it('reports detection with no keys for a service without platform attributes', () => {
    const r = keyRowsFromServiceMap([
      statsRow({ 'apm.platform': 'generic', 'k8s.namespace.name': null }),
    ]);
    expect(r.detectionEnabled).toBe(true);
    expect(toInfraKeys(r.rows).platform).toBe('none');
  });

  it('reports no detection when no row carries the platform', () => {
    expect(keyRowsFromServiceMap([]).detectionEnabled).toBe(false);
  });
});

describe('keyRowsFromServiceMap: PPL array fields on OpenSearch 3.9 and 3.5', () => {
  const k = (key: string) => `sourceNode.keyAttributes.${key}`;
  const scope = 'obs-stack-usw1-rc|observability-stack|deployment|cart';
  const expected = [
    {
      cluster: 'obs-stack-usw1-rc',
      namespace: 'observability-stack',
      kind: 'deployment',
      workload: 'cart',
    },
  ];

  it('reads the scope from a JSON array (3.9)', () => {
    const { rows, detectionEnabled } = keyRowsFromServiceMap([
      { [k('apm.platform')]: ['kubernetes'], [k('apm.k8s.scope')]: [scope] },
    ]);
    expect(detectionEnabled).toBe(true);
    const keys = toInfraKeys(rows);
    expect(keys.platform).toBe('kubernetes');
    expect(keys.scopes).toEqual(expected);
  });

  it('reads the scope from the list string form (3.5), without the brackets', () => {
    // As returned by the playground (OpenSearch 3.5): the tab queried
    // k8s_cluster_name="[obs-stack-usw1-rc" and k8s_deployment_name="cart]".
    const { rows } = keyRowsFromServiceMap([
      { [k('apm.platform')]: '[kubernetes]', [k('apm.k8s.scope')]: `[${scope}]` },
    ]);
    const keys = toInfraKeys(rows);
    expect(keys.platform).toBe('kubernetes');
    expect(keys.scopes).toEqual(expected);
  });

  it('gives one scope per value when a service runs in two clusters, in both forms', () => {
    const a = 'prod-1|shop|deployment|checkout';
    const b = 'prod-2|shop|deployment|checkout-canary';
    [[a, b], `[${a}, ${b}]`].forEach((value) => {
      const keys = toInfraKeys(
        keyRowsFromServiceMap([{ [k('apm.platform')]: ['eks'], [k('apm.k8s.scope')]: value }]).rows
      );
      expect(keys.platform).toBe('eks');
      expect(keys.scopes.map((x) => `${x.cluster}/${x.workload}`).sort()).toEqual([
        'prod-1/checkout',
        'prod-2/checkout-canary',
      ]);
    });
  });

  it('expands host ids (no scope key) in both response forms', () => {
    ['[h1, h2]', ['h1', 'h2']].forEach((hosts) => {
      const keys = toInfraKeys(
        keyRowsFromServiceMap([
          {
            [k('apm.platform')]: '[ec2]',
            [k('cloud.platform')]: '[aws_ec2]',
            [k('host.id')]: hosts,
          },
        ]).rows
      );
      expect(keys.platform).toBe('ec2');
      expect(keys.hostIds).toEqual(['h1', 'h2']);
    });
  });

  it('single-value no-scope path (pushed-down): one real scope', () => {
    // When pushed down, OpenSearch gives one stats row per combination with scalar values.
    // Each row has single values for every key, so the combination is a real scope.
    const keys = toInfraKeys(
      keyRowsFromServiceMap([
        {
          [k('apm.platform')]: 'kubernetes',
          [k('k8s.cluster.name')]: 'c1',
          [k('k8s.namespace.name')]: 'shop',
          [k('k8s.statefulset.name')]: 'db',
        },
      ]).rows
    );
    expect(keys.scopes).toEqual([
      { cluster: 'c1', namespace: 'shop', kind: 'statefulset', workload: 'db' },
    ]);
  });

  it('multi-value no-scope path (not pushed-down): falls back to namespace-only', () => {
    // When not pushed down (e.g. mixed index mappings), OpenSearch returns one row with the
    // array as "[c1, c2]". The individual keys are independent sets; the combinations are
    // unknowable and could match another team's pods. Fall back to namespace-only.
    const keys = toInfraKeys(
      keyRowsFromServiceMap([
        {
          [k('apm.platform')]: '[kubernetes]',
          [k('k8s.cluster.name')]: '[c1, c2]',
          [k('k8s.namespace.name')]: '[shop, staging]',
          [k('k8s.deployment.name')]: '[cart]',
        },
      ]).rows
    );
    expect(keys.namespaceOnly).toBe(true);
    // Namespace × cluster combinations, no workload.
    expect(keys.scopes.map((s) => `${s.cluster}/${s.namespace}`).sort()).toEqual([
      'c1/shop',
      'c1/staging',
      'c2/shop',
      'c2/staging',
    ]);
    expect(keys.scopes.every((s) => s.kind === 'namespace')).toBe(true);
  });

  it('splits the scope on unescaped bars only', () => {
    // Data Prepper escapes `|` and `\` inside a segment (the cluster name is free-form).
    expect(splitK8sScope('prod\\|east|shop|deployment|cart')).toEqual([
      'prod|east',
      'shop',
      'deployment',
      'cart',
    ]);
    expect(splitK8sScope('c\\\\|shop|deployment|cart')).toEqual([
      'c\\',
      'shop',
      'deployment',
      'cart',
    ]);
    expect(splitK8sScope('c|shop|deployment|cart')).toEqual(['c', 'shop', 'deployment', 'cart']);
  });
});
