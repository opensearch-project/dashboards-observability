/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WIZARD_SECTIONS, findSectionForKey, sectionsWithErrors } from '../wizard_sections';

describe('wizard_sections', () => {
  it('routes each known validator key to exactly one section', () => {
    const samples: Array<{ key: string; sectionId: string }> = [
      { key: 'spec.name', sectionId: 'identity' },
      { key: 'spec.datasourceId', sectionId: 'identity' },
      { key: 'spec.service', sectionId: 'owner' },
      { key: 'spec.owner.teams', sectionId: 'owner' },
      { key: 'spec.sli.definition.metric', sectionId: 'sli' },
      { key: 'spec.sli.dimensions[0].name', sectionId: 'sli' },
      { key: 'spec.sli.definition.customExpr.goodQuery', sectionId: 'promql' },
      { key: 'spec.objectives[0].name', sectionId: 'objectives' },
      { key: 'spec.window.duration', sectionId: 'window' },
      { key: 'spec.alerting.burnRates[1].shortWindow', sectionId: 'advanced' },
      { key: 'spec.budgetWarningThresholds[0].threshold', sectionId: 'advanced' },
      { key: 'spec.alarms.noData.forDuration', sectionId: 'advanced' },
      { key: 'spec.exclusionWindows', sectionId: 'exclusions' },
      { key: 'spec.labels["env"]', sectionId: 'labels' },
      { key: 'spec.annotations', sectionId: 'labels' },
    ];
    for (const { key, sectionId } of samples) {
      expect(findSectionForKey(key)?.id).toBe(sectionId);
    }
  });

  it('prefers the longest matching prefix (custom PromQL over generic SLI)', () => {
    expect(findSectionForKey('spec.sli.definition.customExpr')?.id).toBe('promql');
    expect(findSectionForKey('spec.sli.definition.customExpr.goodQuery')?.id).toBe('promql');
    expect(findSectionForKey('spec.sli.definition.metric')?.id).toBe('sli');
  });

  it('returns the set of section ids that carry at least one error', () => {
    const out = sectionsWithErrors({
      'spec.name': 'required',
      'spec.sli.definition.customExpr.goodQuery': 'required',
      'spec.alerting.burnRates[0].shortWindow': 'required',
    });
    expect(out).toEqual(new Set(['identity', 'promql', 'advanced']));
  });

  it('declares every visible section with a stable anchorId', () => {
    const ids = WIZARD_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of WIZARD_SECTIONS) {
      expect(s.anchorId).toMatch(/^slosWizardSection-/);
    }
  });
});

describe('WIZARD_SECTIONS order drift guard', () => {
  // Keep in sync with `visibleSectionIds` in slo_wizard_page.tsx. When nav
  // anchor order and scroll order diverge, the left-rail nav points one way
  // and the physical scroll column goes the other — a past-audit regression.
  it('matches the expected section order', () => {
    expect(WIZARD_SECTIONS.map((s) => s.id)).toEqual([
      'identity',
      'window',
      'owner',
      'sli',
      'promql',
      'objectives',
      'advanced',
      'exclusions',
      'labels',
      'rulesPreview',
    ]);
  });
});
