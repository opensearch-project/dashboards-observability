/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SLO_RULE_REF_SO_TYPE, sloRuleRefId, sloRuleRefType } from '../slo_rule_ref';

describe('slo-rule-ref saved object type', () => {
  it('declares the expected type name', () => {
    expect(SLO_RULE_REF_SO_TYPE).toBe('slo-rule-ref');
    expect(sloRuleRefType.name).toBe('slo-rule-ref');
  });

  it('uses single-namespace scoping', () => {
    expect(sloRuleRefType.namespaceType).toBe('single');
  });

  it('is not importable/exportable (internal registry)', () => {
    expect(sloRuleRefType.management?.importableAndExportable).toBe(false);
  });

  it('declares the minimum mapping surface the reconciler / store need', () => {
    const props = sloRuleRefType.mappings.properties as Record<string, { type: string }>;
    expect(props.workspaceId.type).toBe('keyword');
    expect(props.datasourceId.type).toBe('keyword');
    expect(props.fingerprint.type).toBe('keyword');
    expect(props.refcount.type).toBe('integer');
    expect(props.zeroSinceAt.type).toBe('date');
  });

  describe('sloRuleRefId', () => {
    it('follows the rule-ref:<ws>:<ds>:<fp> format', () => {
      expect(sloRuleRefId('ws-1', 'prom-ds-001', 'deadbeef12345678')).toBe(
        'rule-ref:ws-1:prom-ds-001:deadbeef12345678'
      );
    });
  });
});
