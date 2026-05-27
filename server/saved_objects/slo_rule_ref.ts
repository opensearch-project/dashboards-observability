/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Saved-object type definition for the `slo-rule-ref` registry.
 *
 * One SO per distinct (workspaceId, datasourceId, fingerprint) tuple. The SO
 * tracks how many active SLOs currently reference a given fingerprint — when
 * the refcount hits zero the recording group is eligible for deletion after
 * the grace period (enforced by the reconciler).
 *
 * Workspace partitioning under A.4: `workspaceId` is the real OSD workspace
 * id (`getWorkspaceState(request).requestWorkspaceId`, or `'default'` on
 * non-workspace-enabled clusters). Two workspaces over the same datasource
 * + fingerprint allocate separate slo-rule-ref SOs, each refcounted
 * independently. `datasourceId` continues to identify the Cortex tenant
 * (and the ruler namespace via `slo-generated-<datasourceId>`) — the ruler
 * namespace is shared, the slo-rule-refs are not. Grace-GC fires only when
 * the cross-workspace aggregate refcount for a (datasourceId, fingerprint)
 * tuple hits zero past the grace window; see
 * `SloRuleRefStore.aggregateRefcount` and the GC contract documented in
 * that file.
 */

import type { SavedObjectsType } from '../../../../src/core/server';

export const SLO_RULE_REF_SO_TYPE = 'slo-rule-ref';

/**
 * Attribute shape of a `slo-rule-ref` saved object.
 *
 * `refcount` is a non-negative integer. `zeroSinceAt` is populated only when
 * `refcount === 0`; it carries the ISO-8601 timestamp the refcount dropped to
 * zero, so the reconciler's grace-period sweep can compare `zeroSinceAt +
 * graceMs <= now`.
 */
export interface SloRuleRefAttributes {
  workspaceId: string;
  datasourceId: string;
  fingerprint: string;
  fingerprintVersion: string;
  refcount: number;
  groupName: string;
  namespace: string;
  /**
   * `directQueryName` of the datasource the increment originated against.
   * Persisted at increment time so the reconciler can build a `Datasource`
   * shape sufficient for `RulerClient.deleteRuleGroup` without re-resolving
   * data-source SOs at sweep time. Optional because legacy SOs that
   * pre-date this field still exist in dev environments — the reconciler
   * skips tuples without it and logs.
   */
  directQueryName?: string;
  zeroSinceAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Build the canonical SO id for a (workspace, datasource, fingerprint) tuple.
 *
 * Separator `:` is not legal inside any of the three fields (workspace and
 * datasource are OSD SO ids; fingerprint is lowercase hex), so the concat is
 * unambiguous.
 */
export function sloRuleRefId(
  workspaceId: string,
  datasourceId: string,
  fingerprint: string
): string {
  return `rule-ref:${workspaceId}:${datasourceId}:${fingerprint}`;
}

export const sloRuleRefType: SavedObjectsType = {
  name: SLO_RULE_REF_SO_TYPE,
  // Hidden so the SLO ruler-ref registry does not surface in the SO management
  // UI; it's an internal refcount index, not a user-managed object. The plugin
  // accesses it via `createInternalRepository(['slo-definition', SLO_RULE_REF_SO_TYPE])`,
  // which passes the type as an `extraType` to bypass the hidden filter.
  hidden: true,
  namespaceType: 'single',
  mappings: {
    properties: {
      workspaceId: { type: 'keyword' },
      datasourceId: { type: 'keyword' },
      fingerprint: { type: 'keyword' },
      fingerprintVersion: { type: 'keyword' },
      refcount: { type: 'integer' },
      groupName: { type: 'keyword' },
      namespace: { type: 'keyword' },
      directQueryName: { type: 'keyword' },
      zeroSinceAt: { type: 'date' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
  management: {
    importableAndExportable: false,
  },
};
