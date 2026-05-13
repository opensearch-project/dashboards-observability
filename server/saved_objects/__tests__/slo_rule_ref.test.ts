/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { sloRuleRefId, SLO_RULE_REF_SO_TYPE, sloRuleRefType } from '../slo_rule_ref';

describe('sloRuleRefId — id format', () => {
  it('embeds the fingerprintVersion between datasource and fingerprint', () => {
    const id = sloRuleRefId('ws-001', 'ds-prod', 'v1', 'abcdef0123456789');
    expect(id).toBe('rule-ref:ws-001:ds-prod:v1:abcdef0123456789');
  });

  it('distinct fingerprintVersion on same (ws, ds, fp) yields disjoint ids', () => {
    const v1 = sloRuleRefId('ws-001', 'ds-prod', 'v1', 'abcdef0123456789');
    const v2 = sloRuleRefId('ws-001', 'ds-prod', 'v2', 'abcdef0123456789');
    expect(v1).not.toBe(v2);
  });

  it('parses round-trip cleanly — four known-separator-free segments', () => {
    const id = sloRuleRefId('ws-x', 'ds-y', 'v1', 'deadbeef');
    const [prefix, ws, ds, fpv, fp] = id.split(':');
    expect(prefix).toBe('rule-ref');
    expect(ws).toBe('ws-x');
    expect(ds).toBe('ds-y');
    expect(fpv).toBe('v1');
    expect(fp).toBe('deadbeef');
  });
});

describe('sloRuleRefType — saved object registration', () => {
  it('is named "slo-rule-ref"', () => {
    expect(sloRuleRefType.name).toBe(SLO_RULE_REF_SO_TYPE);
    expect(sloRuleRefType.name).toBe('slo-rule-ref');
  });

  it('uses single-namespace SO (workspace scoping handled by the id)', () => {
    expect(sloRuleRefType.namespaceType).toBe('single');
  });

  it('declares fingerprintVersion in its mapping', () => {
    const props = (sloRuleRefType.mappings as { properties: Record<string, { type?: string }> })
      .properties;
    expect(props.fingerprintVersion).toBeDefined();
    expect(props.fingerprintVersion.type).toBe('keyword');
  });
});
