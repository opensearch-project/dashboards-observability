/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Saved-object type definition for the `slo-rule-ref` registry.
 *
 * One SO per distinct (workspaceId, datasourceId, fingerprintVersion,
 * fingerprint) tuple. The SO tracks how many active SLOs currently reference
 * a given fingerprint — when the refcount hits zero the recording group is
 * eligible for deletion after the grace period (enforced by a later-PR
 * reconciler sweep).
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
  zeroSinceAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Build the canonical SO id for a (workspace, datasource, fingerprintVersion,
 * fingerprint) tuple. Including `fingerprintVersion` in the id means a future
 * bump of `FINGERPRINT_VERSION` produces a disjoint id namespace — old and
 * new-version entries coexist in the same index, and the reconciler's
 * grace-period sweep is the one that eventually reaps the old ones.
 *
 * Separator `:` is not legal inside any of the four fields (workspace and
 * datasource are OSD SO ids; fpv is a constant; fingerprint is lowercase
 * hex), so the concat is unambiguous.
 */
export function sloRuleRefId(
  workspaceId: string,
  datasourceId: string,
  fingerprintVersion: string,
  fingerprint: string
): string {
  return `rule-ref:${workspaceId}:${datasourceId}:${fingerprintVersion}:${fingerprint}`;
}

export const sloRuleRefType: SavedObjectsType = {
  name: SLO_RULE_REF_SO_TYPE,
  hidden: false,
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
      zeroSinceAt: { type: 'date' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
    },
  },
  management: {
    importableAndExportable: false,
  },
};
