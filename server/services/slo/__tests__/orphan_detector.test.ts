/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * detectOrphanDiff tests.
 *
 * Exercises every corner of the pure diff:
 *   - happy path (no diffs), all-missing, all-orphan
 *   - shared groups across SLOs (forward-compat for Phase 3 dedup)
 *   - mixed missing + present + orphan in the same slice
 *   - defensive dedup of `actualGroupNames` on bogus ruler responses
 *   - empty-input no-ops
 *   - echo-through of datasourceId + namespace on every entry
 *
 * Phase 2 categorization is stubbed — `adoptableOrphans` must always be empty.
 */

import { detectOrphanDiff } from '../orphan_detector';

const DS = 'ds-cortex';
const NS = 'slo-generated-ws1';

describe('detectOrphanDiff — happy path', () => {
  it('returns empty diffs when every expected group is present and no extras exist', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['slo:alerts:foo_ab12'],
        'slo-b': ['slo:alerts:bar_cd34'],
      },
      actualGroupNames: ['slo:alerts:foo_ab12', 'slo:alerts:bar_cd34'],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.adoptableOrphans).toEqual([]);
    expect(result.unknownOrphans).toEqual([]);
  });
});

describe('detectOrphanDiff — missing groups', () => {
  it('surfaces a single missing group for one SLO', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['g1'],
      },
      actualGroupNames: [],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toEqual([
      {
        sloId: 'slo-a',
        datasourceId: DS,
        namespace: NS,
        missingGroups: ['g1'],
      },
    ]);
    expect(result.orphans).toEqual([]);
  });

  it('preserves input order in missingGroups', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['g-c', 'g-a', 'g-b'],
      },
      actualGroupNames: [],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toHaveLength(1);
    expect(result.missingBySlo[0].missingGroups).toEqual(['g-c', 'g-a', 'g-b']);
  });

  it('emits at most one MissingEntry per SLO even with multiple absent groups', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['g1', 'g2', 'g3'],
      },
      actualGroupNames: ['g2'],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toEqual([
      {
        sloId: 'slo-a',
        datasourceId: DS,
        namespace: NS,
        missingGroups: ['g1', 'g3'],
      },
    ]);
  });

  it('does not emit a MissingEntry for SLOs whose groups are all present', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['g1'],
        'slo-b': ['g2'],
      },
      actualGroupNames: ['g1'],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toEqual([
      {
        sloId: 'slo-b',
        datasourceId: DS,
        namespace: NS,
        missingGroups: ['g2'],
      },
    ]);
  });
});

describe('detectOrphanDiff — orphans', () => {
  it('classifies a ruler group with no claiming SLO as an unknown orphan (no SLOs in input)', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {},
      actualGroupNames: ['stray'],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.orphans).toEqual([
      {
        datasourceId: DS,
        namespace: NS,
        groupName: 'stray',
      },
    ]);
    expect(result.unknownOrphans).toEqual(result.orphans);
    // Phase 2 stub: adoptable split is always empty.
    expect(result.adoptableOrphans).toEqual([]);
  });

  it('classifies a ruler group not claimed by any of the present SLOs as an unknown orphan', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['g1'],
      },
      actualGroupNames: ['g1', 'stray'],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.orphans).toEqual([
      {
        datasourceId: DS,
        namespace: NS,
        groupName: 'stray',
      },
    ]);
    expect(result.unknownOrphans).toEqual(result.orphans);
    expect(result.adoptableOrphans).toEqual([]);
    expect(result.missingBySlo).toEqual([]);
  });
});

describe('detectOrphanDiff — Phase 3 dedup forward-compat (shared groups)', () => {
  it('reports no missing and no orphan when two SLOs share a group name that is present', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['shared'],
        'slo-b': ['shared'],
      },
      actualGroupNames: ['shared'],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toEqual([]);
    expect(result.orphans).toEqual([]);
  });

  it('reports both SLOs as missing when a shared group has been dropped by the ruler', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['shared'],
        'slo-b': ['shared'],
      },
      actualGroupNames: [],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toHaveLength(2);
    expect(result.missingBySlo).toEqual(
      expect.arrayContaining([
        {
          sloId: 'slo-a',
          datasourceId: DS,
          namespace: NS,
          missingGroups: ['shared'],
        },
        {
          sloId: 'slo-b',
          datasourceId: DS,
          namespace: NS,
          missingGroups: ['shared'],
        },
      ])
    );
    expect(result.orphans).toEqual([]);
  });
});

describe('detectOrphanDiff — mixed scenarios', () => {
  it('handles one missing + one present + one orphan in a single slice', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['present'],
        'slo-b': ['absent'],
      },
      actualGroupNames: ['present', 'stray'],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toEqual([
      {
        sloId: 'slo-b',
        datasourceId: DS,
        namespace: NS,
        missingGroups: ['absent'],
      },
    ]);
    expect(result.orphans).toEqual([
      {
        datasourceId: DS,
        namespace: NS,
        groupName: 'stray',
      },
    ]);
    expect(result.unknownOrphans).toEqual(result.orphans);
    expect(result.adoptableOrphans).toEqual([]);
  });
});

describe('detectOrphanDiff — defensive dedup', () => {
  it('treats duplicate entries in actualGroupNames as a single present group', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['g1'],
      },
      actualGroupNames: ['g1', 'g1'],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toEqual([]);
    // Duplicate 'g1' collapses to one — and since 'g1' is claimed, it's not an orphan.
    expect(result.orphans).toEqual([]);
  });

  it('does not double-count a duplicate orphan', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {},
      actualGroupNames: ['stray', 'stray'],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.orphans).toEqual([
      {
        datasourceId: DS,
        namespace: NS,
        groupName: 'stray',
      },
    ]);
    expect(result.unknownOrphans).toEqual(result.orphans);
  });
});

describe('detectOrphanDiff — empty input', () => {
  it('returns empty arrays for every result field when there is nothing to diff', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {},
      actualGroupNames: [],
      datasourceId: DS,
      namespace: NS,
    });

    expect(result.missingBySlo).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.adoptableOrphans).toEqual([]);
    expect(result.unknownOrphans).toEqual([]);
  });
});

describe('detectOrphanDiff — context echo', () => {
  it('echoes datasourceId and namespace on every MissingEntry and OrphanEntry', () => {
    const result = detectOrphanDiff({
      expectedGroupsBySlo: {
        'slo-a': ['g-missing'],
      },
      actualGroupNames: ['g-orphan'],
      datasourceId: 'ds-echo',
      namespace: 'ns-echo',
    });

    expect(result.missingBySlo).toEqual([
      {
        sloId: 'slo-a',
        datasourceId: 'ds-echo',
        namespace: 'ns-echo',
        missingGroups: ['g-missing'],
      },
    ]);
    expect(result.orphans).toEqual([
      {
        datasourceId: 'ds-echo',
        namespace: 'ns-echo',
        groupName: 'g-orphan',
      },
    ]);
    expect(result.unknownOrphans).toEqual([
      {
        datasourceId: 'ds-echo',
        namespace: 'ns-echo',
        groupName: 'g-orphan',
      },
    ]);
  });
});
