/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getQueryGroupByAttributeSample,
  getQueryServiceMapNodes,
  getQueryServiceMapSlice,
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

  it('lists one side of the nodes as an aggregation, optionally with an attribute', () => {
    const q = getQueryServiceMapNodes('svcmap', 'target', start, end);
    expect(q).toMatch(/^source=svcmap \| where /);
    expect(q).toContain(
      '| stats count() by targetNode.keyAttributes.environment, targetNode.keyAttributes.name, targetNode.type'
    );
    expect(q).not.toContain('dedup');
    expect(getQueryServiceMapNodes('svcmap', 'source', start, end, 'team')).toMatch(
      /sourceNode\.type, `sourceNode\.groupByAttributes\.team`$/
    );
  });

  it('samples both sides of the group-by attributes, bounded', () => {
    const q = getQueryGroupByAttributeSample('svcmap', start, end);
    expect(q).toContain('sourceNode.groupByAttributes');
    expect(q).toContain('targetNode.groupByAttributes');
    expect(q).toMatch(/\| head \d+$/);
  });

  it('filters a slice on either end, escaping values', () => {
    expect(serviceMapSliceWhere({ kind: 'environment', environment: "o'neil" })).toBe(
      " | where sourceNode.keyAttributes.environment = 'o\\'neil' or targetNode.keyAttributes.environment = 'o\\'neil'"
    );
    expect(serviceMapSliceWhere({ kind: 'attribute', attribute: 'team', value: 'pay' })).toBe(
      " | where `sourceNode.groupByAttributes.team` = 'pay' or `targetNode.groupByAttributes.team` = 'pay'"
    );
    expect(serviceMapSliceWhere({ kind: 'names', names: ['a', 'b'] })).toBe(
      " | where sourceNode.keyAttributes.name in ('a', 'b') or targetNode.keyAttributes.name in ('a', 'b')"
    );
  });

  it('pages a slice topology like the full map and counts its connections', () => {
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
