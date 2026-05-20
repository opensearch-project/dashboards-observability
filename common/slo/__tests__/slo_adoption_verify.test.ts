/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 4 W4.7 — integrity-helper unit tests.
 *
 * The helpers in `slo_adoption_verify.ts` are pure (no clock, no I/O), so
 * these tests fix their I/O surface against the W3.3 provenance module's
 * output. Every fixture builds a real provenance object with
 * `buildAlertProvenance` → `annotateAlertGroup`, mirroring exactly what the
 * service writes at create time.
 */

import {
  computeSpecSha256,
  deriveExpectedFingerprintsFromSpec,
  findAdoptableAlertGroup,
  verifyProvenance,
} from '../slo_adoption_verify';
import {
  ALERT_PROVENANCE_ANNOTATION_KEY,
  annotateAlertGroup,
  buildAlertProvenance,
} from '../slo_rule_provenance';
import { computeSliFingerprint } from '../slo_sli_fingerprint';
import {
  DEFAULT_MWMBR_TIERS,
  dedupAlertGroupName,
  dedupRecordingGroupName,
  generateAlertGroupFor,
} from '../slo_promql_generator';
import type { GeneratedRuleGroup, SloDocument, SloSpec } from '../slo_types';

function validSpec(overrides: Partial<SloSpec> = {}): SloSpec {
  return {
    datasourceId: 'prom-ds-001',
    name: 'API Availability',
    enabled: true,
    mode: 'active',
    service: 'api-gateway',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'api-gateway' }],
    },
    objectives: [{ name: 'availability-99-9', target: 0.999 }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: DEFAULT_MWMBR_TIERS.map((t) => ({ ...t })) },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: true },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
    ...overrides,
  };
}

function buildAnnotatedAlertGroup(
  spec: SloSpec,
  sloId: string,
  workspaceId: string,
  fingerprints: Record<string, string>
): { group: GeneratedRuleGroup; provenanceValue: string } {
  const doc: SloDocument = {
    id: sloId,
    spec,
    status: {
      version: 1,
      createdAt: '2026-04-01T00:00:00Z',
      createdBy: 'alice',
      updatedAt: '2026-04-01T00:00:00Z',
      updatedBy: 'alice',
      provisioning: {
        backend: 'prometheus',
        rulerNamespace: `slo-generated-${workspaceId}`,
        recordingFingerprints: fingerprints,
        alertGroupName: dedupAlertGroupName(spec.name, workspaceId, sloId),
      },
    },
  };
  const raw = generateAlertGroupFor(doc, fingerprints, { workspaceId });
  const provenance = buildAlertProvenance({
    pluginVersion: '9.9.9',
    sloId,
    workspaceId,
    datasourceId: spec.datasourceId,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    spec,
  });
  const group = annotateAlertGroup(raw, provenance);
  const provenanceValue = group.rules[0].annotations![ALERT_PROVENANCE_ANNOTATION_KEY];
  return { group, provenanceValue };
}

describe('verifyProvenance (W4.7)', () => {
  it('returns ok for a well-formed annotation with matching recording groups', () => {
    const spec = validSpec();
    const fps = deriveExpectedFingerprintsFromSpec(spec);
    expect(fps).toHaveLength(1);
    const fingerprints = { [spec.objectives[0].name]: fps[0] };
    const { provenanceValue } = buildAnnotatedAlertGroup(spec, 'slo-abc', 'ws-1', fingerprints);

    const actualGroups = [
      dedupAlertGroupName(spec.name, 'ws-1', 'slo-abc'),
      dedupRecordingGroupName(fps[0]),
    ];

    const result = verifyProvenance(provenanceValue, actualGroups);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.parsed?.sloId).toBe('slo-abc');
    expect(result.expectedFingerprints).toEqual([fps[0]]);
  });

  it('returns reason: "schema" on unsupported schema version', () => {
    const spec = validSpec();
    const fps = deriveExpectedFingerprintsFromSpec(spec);
    const fingerprints = { [spec.objectives[0].name]: fps[0] };
    const { provenanceValue } = buildAnnotatedAlertGroup(spec, 'slo-abc', 'ws-1', fingerprints);
    // Parse, bump schemaVersion, and re-stringify to synthesize a v99 payload.
    const parsed = JSON.parse(provenanceValue);
    parsed.schemaVersion = 99;
    const mutated = JSON.stringify(parsed);

    const actualGroups = [dedupRecordingGroupName(fps[0])];
    const result = verifyProvenance(mutated, actualGroups);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('schema');
  });

  it('returns reason: "sha256" when spec drifts', () => {
    const spec = validSpec();
    const fps = deriveExpectedFingerprintsFromSpec(spec);
    const fingerprints = { [spec.objectives[0].name]: fps[0] };
    const { provenanceValue } = buildAnnotatedAlertGroup(spec, 'slo-abc', 'ws-1', fingerprints);
    // Parse, tamper with the embedded spec name, and re-stringify — the
    // specSha256 no longer matches.
    const parsed = JSON.parse(provenanceValue);
    parsed.spec.name = 'Tampered name';
    const mutated = JSON.stringify(parsed);

    const actualGroups = [dedupRecordingGroupName(fps[0])];
    const result = verifyProvenance(mutated, actualGroups);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('sha256');
    expect(result.parsed?.sloId).toBe('slo-abc');
  });

  it('returns reason: "fingerprints" with populated missingRecordingGroups when a recording group is absent', () => {
    const spec = validSpec();
    const fps = deriveExpectedFingerprintsFromSpec(spec);
    const fingerprints = { [spec.objectives[0].name]: fps[0] };
    const { provenanceValue } = buildAnnotatedAlertGroup(spec, 'slo-abc', 'ws-1', fingerprints);

    // Actual groups omit the recording group — this is the ruler-side
    // mid-deploy drift scenario.
    const actualGroups = [dedupAlertGroupName(spec.name, 'ws-1', 'slo-abc')];
    const result = verifyProvenance(provenanceValue, actualGroups);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('fingerprints');
    expect(result.missingRecordingGroups).toEqual([dedupRecordingGroupName(fps[0])]);
    expect(result.expectedFingerprints).toEqual([fps[0]]);
  });

  it('returns reason: "parse" on malformed annotation JSON', () => {
    const result = verifyProvenance('{not-json', []);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('parse');
    expect(result.parsed).toBeUndefined();
  });
});

describe('deriveExpectedFingerprintsFromSpec (W4.7)', () => {
  it('matches computeSliFingerprint for each objective, preserving order and dedup', () => {
    const spec = validSpec({
      objectives: [
        { name: 'availability-99-9', target: 0.999 },
        // Duplicate SLI shape → same fingerprint as the first — deduped in output.
        { name: 'availability-99-95', target: 0.9995 },
      ],
    });
    const fps = deriveExpectedFingerprintsFromSpec(spec);
    const direct = new Set(
      spec.objectives
        .map((o) => computeSliFingerprint(spec.datasourceId, spec.sli, o))
        .filter((x): x is string => x !== null)
    );
    expect(new Set(fps)).toEqual(direct);
  });

  it('returns [] for composite SLIs', () => {
    const spec = validSpec({
      sli: { type: 'composite', operator: 'all', members: [] },
    });
    expect(deriveExpectedFingerprintsFromSpec(spec)).toEqual([]);
  });
});

describe('findAdoptableAlertGroup (W4.7)', () => {
  it('returns the matching group + raw annotation value when sloId matches', () => {
    const spec = validSpec();
    const fps = deriveExpectedFingerprintsFromSpec(spec);
    const fingerprints = { [spec.objectives[0].name]: fps[0] };
    const { group, provenanceValue } = buildAnnotatedAlertGroup(
      spec,
      'slo-xyz',
      'ws-9',
      fingerprints
    );

    const result = findAdoptableAlertGroup([group], 'slo-xyz');
    expect(result).not.toBeNull();
    expect(result!.group.groupName).toBe(group.groupName);
    expect(result!.provenanceValue).toBe(provenanceValue);
  });

  it('returns null when sloId does not match any group', () => {
    const spec = validSpec();
    const fps = deriveExpectedFingerprintsFromSpec(spec);
    const fingerprints = { [spec.objectives[0].name]: fps[0] };
    const { group } = buildAnnotatedAlertGroup(spec, 'slo-xyz', 'ws-9', fingerprints);
    expect(findAdoptableAlertGroup([group], 'different-id')).toBeNull();
  });

  it('returns null when no provenance annotation is present (D2: legacy monolithic groups)', () => {
    // A hand-crafted group with no `osd_slo_provenance` annotation — this is
    // what a pre-dedup rule group looks like. Adoption must not accept these.
    const legacy: GeneratedRuleGroup = {
      groupName: 'slo-generated-ws-9-legacy',
      interval: 60,
      rules: [
        {
          type: 'alerting',
          name: 'LegacyAlert',
          expr: 'vector(0) > 1',
          labels: { slo_id: 'slo-xyz' },
          description: 'legacy rule — no provenance',
        },
      ],
      yaml: '',
    };
    expect(findAdoptableAlertGroup([legacy], 'slo-xyz')).toBeNull();
  });
});

describe('computeSpecSha256 re-export (W4.7)', () => {
  it('is stable and keyed on spec shape', () => {
    const a = computeSpecSha256(validSpec());
    const b = computeSpecSha256(validSpec({ name: 'Different' }));
    expect(a).not.toBe(b);
    expect(a).toBe(computeSpecSha256(validSpec()));
  });
});
