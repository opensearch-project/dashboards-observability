/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Drift-guard for `WIZARD_SECTIONS`. The order and shape of this list is
 * load-bearing — it drives:
 *   - the visual order of the wizard panels (wizard_page);
 *   - the anchor nav (wizard_nav);
 *   - the validation summary grouping (wizard_validation_summary);
 *   - the rule-preview empty state's missing-fields list.
 *
 * Pinning the order here means a future refactor can't silently shuffle
 * the user-facing layout without updating the test.
 */

import {
  WIZARD_SECTIONS,
  WizardSectionId,
  findSectionForKey,
  sectionsWithErrors,
} from '../wizard_sections';

describe('WIZARD_SECTIONS — drift guard', () => {
  it('preserves the canonical visual order', () => {
    const ids = WIZARD_SECTIONS.map((s) => s.id);
    expect(ids).toEqual<WizardSectionId[]>([
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

  it('every section has a unique anchor id (anchor-id collisions break scrollIntoView)', () => {
    const anchors = WIZARD_SECTIONS.map((s) => s.anchorId);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('every section has a non-empty label', () => {
    for (const section of WIZARD_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0);
    }
  });

  it('errorPrefixes do not overlap shorter prefixes (longest-prefix match relies on this)', () => {
    // Specifically: the SLI prefix `spec.sli` is a prefix of the PromQL
    // section's `spec.sli.definition.customExpr`. The longest-prefix match
    // in `findSectionForKey` is what keeps these from clashing — pin the
    // expected resolution.
    const sliKey = 'spec.sli.dimensions';
    const promqlKey = 'spec.sli.definition.customExpr.goodQuery';
    expect(findSectionForKey(sliKey)?.id).toBe('sli');
    expect(findSectionForKey(promqlKey)?.id).toBe('promql');
  });
});

describe('findSectionForKey', () => {
  it('returns undefined for keys with no matching prefix', () => {
    expect(findSectionForKey('totally.unrelated.key')).toBeUndefined();
  });

  it('matches indexed errors (`spec.objectives[0].name`)', () => {
    expect(findSectionForKey('spec.objectives[0].name')?.id).toBe('objectives');
    expect(findSectionForKey('spec.alerting.burnRates[2].shortWindow')?.id).toBe('advanced');
  });

  it('matches an exact-equal prefix (`spec.name`)', () => {
    expect(findSectionForKey('spec.name')?.id).toBe('identity');
  });
});

describe('sectionsWithErrors', () => {
  it('returns an empty set for no errors', () => {
    expect(sectionsWithErrors({})).toEqual(new Set());
  });

  it('groups errors by their owning section', () => {
    const errors = {
      'spec.name': 'required',
      'spec.objectives[0].target': 'out of range',
      'spec.alerting.burnRates[0].shortWindow': 'invalid duration',
    };
    expect(sectionsWithErrors(errors)).toEqual(new Set(['identity', 'objectives', 'advanced']));
  });
});
