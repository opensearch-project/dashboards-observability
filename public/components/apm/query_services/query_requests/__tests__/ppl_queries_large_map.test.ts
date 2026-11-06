/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getQueryServiceMapEnvironmentSizes,
  getQueryServiceMapFields,
  getQueryServiceMapNodes,
  getQueryServiceMapSlice,
  getQueryServiceMapSliceEdges,
  getQuerySliceDistinctEdgeCount,
  groupByAttributeField,
  serviceMapSliceWhere,
} from '../ppl_queries';

describe('large-map PPL queries', () => {
  const start = new Date('2026-09-27T20:00:00.000Z');
  const end = new Date('2026-09-27T20:15:00.000Z');

  it('backquotes group-by attribute fields and rejects unsafe paths', () => {
    expect(groupByAttributeField('source', 'telemetry.sdk.language')).toBe(
      '`sourceNode.groupByAttributes.telemetry.sdk.language`'
    );
    expect(() => groupByAttributeField('target', "x` | where 1=1 | eval y='")).toThrow(
      'Invalid group-by attribute'
    );
  });

  it('ends every aggregation in an explicit head, so core does not cap it at the sample size', () => {
    [
      getQueryServiceMapEnvironmentSizes('svcmap', 'source', start, end),
      getQueryServiceMapNodes('svcmap', 'target', start, end),
      getQueryServiceMapSliceEdges(
        'svcmap',
        { kind: 'environment', environment: 'dev' },
        start,
        end
      ),
    ].forEach((q) => expect(q).toMatch(/\| head 10000$/));
  });

  it('counts nodes per environment on one side', () => {
    expect(getQueryServiceMapEnvironmentSizes('svcmap', 'target', start, end)).toContain(
      '| stats distinct_count(targetNode.keyAttributes.name) as nodes by targetNode.keyAttributes.environment'
    );
  });

  it('lists one side of the nodes, optionally with an attribute and for some environments', () => {
    const q = getQueryServiceMapNodes('svcmap', 'target', start, end);
    expect(q).toMatch(/^source=svcmap \| where /);
    expect(q).toContain(
      '| stats count() by targetNode.keyAttributes.environment, targetNode.keyAttributes.name, targetNode.type'
    );
    expect(q).not.toContain('dedup');
    expect(getQueryServiceMapNodes('svcmap', 'source', start, end, 'team')).toContain(
      'sourceNode.type, `sourceNode.groupByAttributes.team` | head'
    );
    expect(
      getQueryServiceMapNodes('svcmap', 'source', start, end, undefined, ['dev', "o'x", null])
    ).toContain(
      "| where sourceNode.keyAttributes.environment in ('dev', 'o''x') or isnull(sourceNode.keyAttributes.environment) |"
    );
    expect(getQueryServiceMapNodes('svcmap', 'source', start, end, undefined, [null])).toContain(
      '| where isnull(sourceNode.keyAttributes.environment) |'
    );
  });

  it('reads the group-by keys from the mapping', () => {
    expect(getQueryServiceMapFields('svcmap*')).toBe('describe svcmap* | fields COLUMN_NAME');
  });

  it('filters a slice on either end (or one), with quotes doubled', () => {
    expect(serviceMapSliceWhere({ kind: 'environment', environment: "o'neil" })).toBe(
      " | where sourceNode.keyAttributes.environment = 'o''neil' or targetNode.keyAttributes.environment = 'o''neil'"
    );
    expect(serviceMapSliceWhere({ kind: 'attribute', attribute: 'team', value: 'pay' })).toBe(
      " | where `sourceNode.groupByAttributes.team` = 'pay' or `targetNode.groupByAttributes.team` = 'pay'"
    );
    expect(serviceMapSliceWhere({ kind: 'names', names: ['a', 'b'] })).toBe(
      " | where sourceNode.keyAttributes.name in ('a', 'b') or targetNode.keyAttributes.name in ('a', 'b')"
    );
    expect(serviceMapSliceWhere({ kind: 'names', names: ['a'], side: 'target' })).toBe(
      " | where targetNode.keyAttributes.name in ('a')"
    );
  });

  it('reads a slice as an aggregation over both ends, optionally one name chunk of a side', () => {
    const filter = { kind: 'environment', environment: 'dev' } as const;
    const q = getQueryServiceMapSliceEdges('svcmap', filter, start, end);
    expect(q).toContain("environment = 'dev'");
    expect(q).toContain(
      '| stats count() by sourceNode.keyAttributes.environment, sourceNode.keyAttributes.name, sourceNode.type, targetNode.keyAttributes.environment, targetNode.keyAttributes.name, targetNode.type'
    );
    expect(q).not.toContain('dedup');
    expect(
      getQueryServiceMapSliceEdges('svcmap', filter, start, end, { side: 'source', names: ['a'] })
    ).toContain(
      "or targetNode.keyAttributes.environment = 'dev' | where sourceNode.keyAttributes.name in ('a') |"
    );
  });

  it('pages a slice dedup like the full map and counts its connections', () => {
    const filter = { kind: 'environment', environment: 'dev' } as const;
    const first = getQueryServiceMapSlice('svcmap', filter, start, end);
    expect(first).toContain("environment = 'dev'");
    expect(first).toContain('| dedup nodeConnectionHash | sort nodeConnectionHash');
    expect(first).not.toContain(' from ');
    expect(getQueryServiceMapSlice('svcmap', filter, start, end, 2000)).toContain(' from 2000');
    expect(getQuerySliceDistinctEdgeCount('svcmap', filter, start, end)).toMatch(
      /environment = 'dev' \| stats distinct_count\(nodeConnectionHash\) as edges$/
    );
  });
});
