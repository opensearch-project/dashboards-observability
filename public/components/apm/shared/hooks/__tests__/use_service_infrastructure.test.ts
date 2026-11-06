/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

jest.mock('../../../config/apm_config_context', () => ({ useApmConfig: () => ({ config: null }) }));

import { keyRowsFromServiceMap, toInfraKeys } from '../use_service_infrastructure';

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
