/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 4 W4.2 — orphan-categorization tests for `detectOrphanDiff`.
 *
 * Exercises each category the Phase 4 adoption UX needs to distinguish:
 *   - No-provenance orphan (D2 legacy-layout) → unknownOrphans with diagnostic
 *   - Alert-provenance v1, sha match, fingerprints present → adoptableOrphans, 'ok'
 *   - Alert-provenance v1, sha mismatch → unknownOrphans, 'mismatch'
 *   - Alert-provenance v1, missing recording fp → unknownOrphans, 'mismatch'
 *   - Alert-provenance v99 → unknownOrphans, 'unsupported_schema'
 *   - Alert-provenance unparseable → unknownOrphans, 'provenance annotation unparseable'
 *   - Standalone recording orphan → unknownOrphans, 'recording-only orphan; matching alert group missing'
 *   - Alert + recording orphan pair → alert surfaces as adoptable; recording is suppressed
 *   - Fingerprints array matches computeSliFingerprint over embedded spec's objectives
 */

import { detectOrphanDiff } from '../orphan_detector';
import type { OrphanEntry } from '../orphan_detector';
import {
  ALERT_PROVENANCE_ANNOTATION_KEY,
  annotateAlertGroup,
  buildAlertProvenance,
} from '../../../../common/slo/slo_rule_provenance';
import { computeSliFingerprint } from '../../../../common/slo/slo_sli_fingerprint';
import { dedupRecordingGroupName } from '../../../../common/slo/slo_promql_generator';
import type { GeneratedRule, GeneratedRuleGroup, SloSpec } from '../../../../common/slo/slo_types';

const DS = 'ds-cortex';
const NS = 'slo-generated-ws1';

function validSpec(overrides: Partial<SloSpec> = {}): SloSpec {
  return {
    datasourceId: DS,
    name: 'API availability',
    enabled: true,
    mode: 'active',
    service: 'api',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'api' }],
    },
    objectives: [{ name: 'availability-99-9', target: 0.999 }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: [] },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: false },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
    ...overrides,
  };
}

function stubAlertRule(name: string): GeneratedRule {
  return {
    type: 'alerting',
    name,
    expr: 'vector(1) > 0',
    for: '2m',
    labels: { slo_id: 'slo-1' },
    description: name,
  };
}

function stubRecordingRule(name: string): GeneratedRule {
  return {
    type: 'recording',
    name,
    expr: 'vector(0)',
    labels: { slo_window: '5m' },
    description: name,
  };
}

function bareGroup(groupName: string, rules: GeneratedRule[] = []): GeneratedRuleGroup {
  return { groupName, interval: 60, rules, yaml: '' };
}

/**
 * Convenience: construct an alert group annotated with the Phase 3 provenance
 * shape. `specOverride` lets individual tests tweak the embedded spec before
 * annotation so the sha256 matches the eventual adoption check.
 */
function alertGroupWithProvenance(
  groupName: string,
  sloId: string,
  spec: SloSpec
): GeneratedRuleGroup {
  const base = bareGroup(groupName, [stubAlertRule('burn-rate-alert')]);
  const provenance = buildAlertProvenance({
    pluginVersion: '4.0.0',
    sloId,
    workspaceId: 'ws-1',
    datasourceId: spec.datasourceId,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    spec,
  });
  return annotateAlertGroup(base, provenance);
}

/**
 * Build a recording group the way the Phase-3 service deploys it — NO
 * annotation (Cortex/Prometheus reject annotations on recording rules). The
 * detector recognizes recording groups by the `slo:rec:<fp>` name pattern.
 */
function recordingGroupForFingerprint(fingerprint: string): GeneratedRuleGroup {
  const groupName = dedupRecordingGroupName(fingerprint);
  return bareGroup(groupName, [
    stubRecordingRule(`slo:sli_error:ratio_rate_5m:sli_${fingerprint}`),
  ]);
}

function findEntry(entries: OrphanEntry[], groupName: string): OrphanEntry | undefined {
  return entries.find((e) => e.groupName === groupName);
}

describe('detectOrphanDiff — Phase 4 categorization', () => {
  describe('no provenance on any rule in the orphan group', () => {
    it('surfaces a "pre-Phase-3 rule layout" diagnostic in unknownOrphans', () => {
      const group = bareGroup('slo:legacy_abc1234', [stubAlertRule('burn-rate-alert')]);
      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [group.groupName],
        actualGroups: [group],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(0);
      expect(result.unknownOrphans).toHaveLength(1);
      expect(result.unknownOrphans[0].diagnostic).toBe(
        'pre-Phase-3 rule layout; not eligible for adoption'
      );
      expect(result.unknownOrphans[0].sourceSloId).toBeUndefined();
      expect(result.unknownOrphans[0].specIntegrity).toBeUndefined();
    });
  });

  describe('alert provenance — schema v1, sha256 match, recording groups present', () => {
    it('emits adoptableOrphans entry with specIntegrity=ok + full metadata', () => {
      const spec = validSpec();
      const fingerprint = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0]);
      expect(fingerprint).not.toBeNull();
      const alertGroup = alertGroupWithProvenance(
        'slo:alerts:api-availability_abc1',
        'slo-1',
        spec
      );
      const recordingGroup = recordingGroupForFingerprint(fingerprint!);

      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [alertGroup.groupName, recordingGroup.groupName],
        actualGroups: [alertGroup, recordingGroup],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(1);
      const entry = result.adoptableOrphans[0];
      expect(entry.groupName).toBe(alertGroup.groupName);
      expect(entry.sourceSloId).toBe('slo-1');
      expect(entry.sourceWorkspaceId).toBe('ws-1');
      expect(entry.schemaVersion).toBe(1);
      expect(entry.specIntegrity).toBe('ok');
      expect(entry.spec).toMatchObject({ name: spec.name });
      expect(entry.fingerprints).toEqual([fingerprint]);
      // Recording group is suppressed from the orphan list — it was paired
      // with the adoptable alert group.
      expect(result.unknownOrphans).toHaveLength(0);
    });
  });

  describe('alert provenance — schema v1, sha256 mismatch', () => {
    it('emits unknownOrphans entry with specIntegrity=mismatch', () => {
      const spec = validSpec();
      // Build a valid provenance, then tamper with the embedded spec so
      // `computeSpecSha256(entry.spec)` no longer matches `specSha256`.
      const group = alertGroupWithProvenance('slo:alerts:drifted_abc1', 'slo-1', spec);
      const rule = group.rules[0];
      const raw = rule.annotations![ALERT_PROVENANCE_ANNOTATION_KEY];
      const parsed = JSON.parse(raw);
      parsed.spec = { ...parsed.spec, name: 'edited-out-of-band' };
      const tampered: GeneratedRuleGroup = {
        ...group,
        rules: [
          {
            ...rule,
            annotations: {
              ...rule.annotations,
              [ALERT_PROVENANCE_ANNOTATION_KEY]: JSON.stringify(parsed),
            },
          },
          ...group.rules.slice(1),
        ],
      };

      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [tampered.groupName],
        actualGroups: [tampered],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(0);
      expect(result.unknownOrphans).toHaveLength(1);
      const entry = result.unknownOrphans[0];
      expect(entry.specIntegrity).toBe('mismatch');
      expect(entry.sourceSloId).toBe('slo-1');
      expect(entry.diagnostic).toContain('specSha256 mismatch');
    });
  });

  describe('alert provenance — schema v1, sha match, missing recording fingerprint', () => {
    it('emits unknownOrphans entry with specIntegrity=mismatch citing the missing fp', () => {
      const spec = validSpec();
      const fingerprint = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
      const alertGroup = alertGroupWithProvenance('slo:alerts:api_xy1', 'slo-1', spec);
      // Deliberately omit the recording group — the integrity check should
      // flag that `slo:rec:<fp>` is absent.
      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [alertGroup.groupName],
        actualGroups: [alertGroup],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(0);
      expect(result.unknownOrphans).toHaveLength(1);
      const entry = result.unknownOrphans[0];
      expect(entry.specIntegrity).toBe('mismatch');
      expect(entry.fingerprints).toEqual([fingerprint]);
      expect(entry.diagnostic).toContain('missing recording group');
      expect(entry.diagnostic).toContain(fingerprint);
    });
  });

  describe('alert provenance — unsupported schema version', () => {
    it('emits unknownOrphans entry with specIntegrity=unsupported_schema', () => {
      const spec = validSpec();
      const group = alertGroupWithProvenance('slo:alerts:unknownschema_ab1', 'slo-1', spec);
      const rule = group.rules[0];
      const parsed = JSON.parse(rule.annotations![ALERT_PROVENANCE_ANNOTATION_KEY]);
      parsed.schemaVersion = 99;
      const bumped: GeneratedRuleGroup = {
        ...group,
        rules: [
          {
            ...rule,
            annotations: {
              ...rule.annotations,
              [ALERT_PROVENANCE_ANNOTATION_KEY]: JSON.stringify(parsed),
            },
          },
          ...group.rules.slice(1),
        ],
      };

      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [bumped.groupName],
        actualGroups: [bumped],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(0);
      expect(result.unknownOrphans).toHaveLength(1);
      const entry = result.unknownOrphans[0];
      expect(entry.specIntegrity).toBe('unsupported_schema');
      expect(entry.schemaVersion).toBe(99);
      expect(entry.sourceSloId).toBe('slo-1');
      expect(entry.diagnostic).toContain('schemaVersion 99 not supported');
    });
  });

  describe('alert provenance — malformed JSON', () => {
    it('emits unknownOrphans entry with diagnostic="provenance annotation unparseable"', () => {
      const group = bareGroup('slo:alerts:malformed_ab1', [
        {
          ...stubAlertRule('burn-rate-alert'),
          annotations: {
            [ALERT_PROVENANCE_ANNOTATION_KEY]: '{this is not json',
          },
        },
      ]);

      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [group.groupName],
        actualGroups: [group],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(0);
      expect(result.unknownOrphans).toHaveLength(1);
      expect(result.unknownOrphans[0].diagnostic).toBe('provenance annotation unparseable');
      expect(result.unknownOrphans[0].specIntegrity).toBeUndefined();
    });
  });

  describe('standalone recording-only orphan', () => {
    it('emits unknownOrphans entry with diagnostic "recording-only orphan"', () => {
      const fp = 'deadbeefcafefeed';
      const recordingGroup = recordingGroupForFingerprint(fp);

      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [recordingGroup.groupName],
        actualGroups: [recordingGroup],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(0);
      expect(result.unknownOrphans).toHaveLength(1);
      expect(result.unknownOrphans[0].diagnostic).toBe(
        'recording-only orphan; matching alert group missing'
      );
    });
  });

  describe('paired alert + recording orphan', () => {
    it('adopts the alert group and suppresses the paired recording group', () => {
      const spec = validSpec();
      const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
      const alertGroup = alertGroupWithProvenance('slo:alerts:paired_ab1', 'slo-1', spec);
      const recordingGroup = recordingGroupForFingerprint(fp);

      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [alertGroup.groupName, recordingGroup.groupName],
        actualGroups: [alertGroup, recordingGroup],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(1);
      expect(result.adoptableOrphans[0].groupName).toBe(alertGroup.groupName);
      expect(result.unknownOrphans).toHaveLength(0);
      // And the combined `orphans` list reflects the same — the paired
      // recording group is not double-counted.
      expect(result.orphans).toHaveLength(1);
      expect(findEntry(result.orphans, recordingGroup.groupName)).toBeUndefined();
    });
  });

  describe('fingerprints derived from embedded spec', () => {
    it('matches computeSliFingerprint over every objective in the spec', () => {
      // Two objectives with *different* latency thresholds produce distinct
      // fingerprints (the latency threshold participates in the fingerprint
      // for `latency_threshold` SLIs).
      const spec = validSpec({
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'latency_threshold',
            calcMethod: 'events',
            metric: 'http_request_duration_seconds',
            latencyThresholdUnit: 'seconds',
          },
          dimensions: [{ name: 'service', value: 'api' }],
        },
        objectives: [
          { name: 'p99-fast', target: 0.99, latencyThreshold: 0.25 },
          { name: 'p99-slower', target: 0.99, latencyThreshold: 1.0 },
        ],
      });
      const fp1 = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
      const fp2 = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[1])!;
      expect(fp1).not.toBe(fp2);
      const alertGroup = alertGroupWithProvenance('slo:alerts:twoobj_ab1', 'slo-1', spec);
      const rec1 = recordingGroupForFingerprint(fp1);
      const rec2 = recordingGroupForFingerprint(fp2);

      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [alertGroup.groupName, rec1.groupName, rec2.groupName],
        actualGroups: [alertGroup, rec1, rec2],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(1);
      // Both fingerprints must be present in the entry's fingerprints list
      // (order is objective order, dedup applied for identical fps).
      const entry = result.adoptableOrphans[0];
      expect(entry.fingerprints).toHaveLength(2);
      expect(entry.fingerprints).toEqual(expect.arrayContaining([fp1, fp2]));
      expect(entry.specIntegrity).toBe('ok');
    });

    it('name-only callers: detector classifies by name pattern alone', () => {
      // Recording groups are recognized by their `slo:rec:<fp>` name pattern;
      // the name-only path surfaces the same recording-only diagnostic as the
      // full-group path. Alert-group orphans without `actualGroups` carry no
      // provenance to inspect, so they land in `unknownOrphans` with the
      // minimal shape (no diagnostic / metadata).
      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: ['slo:alerts:anything_ab1', 'slo:rec:ffff'],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(0);
      expect(result.unknownOrphans).toHaveLength(2);
      const alertEntry = findEntry(result.unknownOrphans, 'slo:alerts:anything_ab1');
      expect(alertEntry?.diagnostic).toBeUndefined();
      expect(alertEntry?.specIntegrity).toBeUndefined();
      const recordingEntry = findEntry(result.unknownOrphans, 'slo:rec:ffff');
      expect(recordingEntry?.diagnostic).toBe(
        'recording-only orphan; matching alert group missing'
      );
    });
  });

  describe('recording-only annotation when paired alert was claimed (missing-not-orphan)', () => {
    it('does not resurrect a recording group when its peer is already covered by a live SLO', () => {
      // The alert group is claimed by a live SLO (not orphan), so the
      // recording group for the same fingerprint would otherwise be orphan
      // too. But since the recording group is the expected partner of an
      // SLO that's deployed, it's listed in expectedGroupsBySlo and thus
      // not orphan. Assert that setup holds end-to-end.
      const spec = validSpec();
      const fp = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0])!;
      const alertGroup = alertGroupWithProvenance('slo:alerts:live_ab1', 'slo-1', spec);
      const rec = recordingGroupForFingerprint(fp);

      const result = detectOrphanDiff({
        expectedGroupsBySlo: {
          'slo-1': [alertGroup.groupName, rec.groupName],
        },
        actualGroupNames: [alertGroup.groupName, rec.groupName],
        actualGroups: [alertGroup, rec],
        datasourceId: DS,
        namespace: NS,
      });

      expect(result.adoptableOrphans).toHaveLength(0);
      expect(result.unknownOrphans).toHaveLength(0);
      expect(result.missingBySlo).toHaveLength(0);
      expect(result.orphans).toHaveLength(0);
    });
  });

  describe('recording group with unparseable/stray annotation', () => {
    it('ignores any annotation and still classifies by name pattern', () => {
      const group = bareGroup('slo:rec:garbage1', [
        {
          ...stubRecordingRule('slo:sli_error:ratio_rate_5m:sli_garbage1'),
          // Stray annotation from a pre-fix build — detector no longer reads
          // recording-rule annotations; classification is name-pattern only.
          annotations: { some_other_annotation: 'ignored' },
        },
      ]);
      const result = detectOrphanDiff({
        expectedGroupsBySlo: {},
        actualGroupNames: [group.groupName],
        actualGroups: [group],
        datasourceId: DS,
        namespace: NS,
      });
      expect(result.unknownOrphans).toHaveLength(1);
      expect(result.unknownOrphans[0].diagnostic).toBe(
        'recording-only orphan; matching alert group missing'
      );
    });
  });
});
