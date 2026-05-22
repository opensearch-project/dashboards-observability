/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';

/**
 * Section metadata shared between the anchor nav, the top-level validation
 * summary, and the rule-preview empty state. Keeping it in one place means
 * renames (e.g. "Advanced" → "Alerting") land in a single file and all three
 * surfaces pick them up.
 *
 * `errorPrefixes` are matched against the validator's error keys (e.g.
 * `spec.name`, `spec.alerting.burnRates[0].shortWindow`). The first matching
 * section owns the error.
 */

export type WizardSectionId =
  | 'identity'
  | 'owner'
  | 'sli'
  | 'promql'
  | 'objectives'
  | 'window'
  | 'advanced'
  | 'exclusions'
  | 'labels'
  | 'rulesPreview';

export interface WizardSection {
  id: WizardSectionId;
  label: string;
  /** DOM id rendered on the section wrapper; used for scroll-to-section. */
  anchorId: string;
  /** Error keys starting with any of these prefixes belong to this section. */
  errorPrefixes: readonly string[];
  /**
   * Field-level DOM ids (or `data-test-subj` values) we know how to scroll to
   * when the user clicks an error in the summary. Key = exact validator key.
   */
  fieldIds?: Readonly<Record<string, string>>;
}

export const WIZARD_SECTIONS: readonly WizardSection[] = [
  {
    id: 'identity',
    label: i18n.translate('observability.apm.slo.wizard.section.identity', {
      defaultMessage: 'Identity',
    }),
    anchorId: 'slosWizardSection-identity',
    errorPrefixes: ['spec.name', 'spec.datasourceId', 'spec.enabled', 'spec.mode'],
    fieldIds: {
      'spec.name': 'slosWizardName',
      'spec.datasourceId': 'slosWizardDatasourceId',
    },
  },
  // Window comes before SLI + objectives because the chosen time window
  // conditions the SLI shape (audit cite S5).
  {
    id: 'window',
    label: i18n.translate('observability.apm.slo.wizard.section.window', {
      defaultMessage: 'Window & mode',
    }),
    anchorId: 'slosWizardSection-window',
    errorPrefixes: ['spec.window'],
  },
  {
    id: 'owner',
    label: i18n.translate('observability.apm.slo.wizard.section.owner', {
      defaultMessage: 'Service & owner',
    }),
    anchorId: 'slosWizardSection-owner',
    errorPrefixes: ['spec.service', 'spec.owner'],
    fieldIds: {
      'spec.service': 'slosWizardService',
      'spec.owner.teams': 'slosWizardOwnerTeam',
    },
  },
  {
    id: 'sli',
    label: i18n.translate('observability.apm.slo.wizard.section.sli', {
      defaultMessage: 'SLI',
    }),
    anchorId: 'slosWizardSection-sli',
    errorPrefixes: ['spec.sli'],
  },
  {
    id: 'promql',
    label: i18n.translate('observability.apm.slo.wizard.section.promql', {
      defaultMessage: 'Custom PromQL',
    }),
    anchorId: 'slosWizardSection-promql',
    errorPrefixes: ['spec.sli.definition.customExpr'],
  },
  {
    id: 'objectives',
    label: i18n.translate('observability.apm.slo.wizard.section.objectives', {
      defaultMessage: 'Objectives',
    }),
    anchorId: 'slosWizardSection-objectives',
    errorPrefixes: ['spec.objectives'],
  },
  {
    id: 'advanced',
    label: i18n.translate('observability.apm.slo.wizard.section.advanced', {
      defaultMessage: 'Advanced',
    }),
    anchorId: 'slosWizardSection-advanced',
    errorPrefixes: ['spec.alerting', 'spec.budgetWarningThresholds', 'spec.alarms'],
  },
  {
    id: 'exclusions',
    label: i18n.translate('observability.apm.slo.wizard.section.exclusions', {
      defaultMessage: 'Exclusion windows',
    }),
    anchorId: 'slosWizardSection-exclusions',
    errorPrefixes: ['spec.exclusionWindows'],
  },
  {
    id: 'labels',
    label: i18n.translate('observability.apm.slo.wizard.section.labels', {
      defaultMessage: 'Labels & annotations',
    }),
    anchorId: 'slosWizardSection-labels',
    errorPrefixes: ['spec.labels', 'spec.annotations'],
  },
  {
    id: 'rulesPreview',
    label: i18n.translate('observability.apm.slo.wizard.section.rulesPreview', {
      defaultMessage: 'Rule preview',
    }),
    anchorId: 'slosWizardSection-rulesPreview',
    errorPrefixes: [],
  },
];

/**
 * Find the section that owns a given validator error key. Longest-prefix wins
 * so `spec.sli.definition.customExpr.goodQuery` goes to PromQL rather than
 * SLI even though both sections could claim it.
 */
export function findSectionForKey(key: string): WizardSection | undefined {
  let match: { section: WizardSection; prefix: string } | undefined;
  for (const section of WIZARD_SECTIONS) {
    for (const prefix of section.errorPrefixes) {
      if (key === prefix || key.startsWith(prefix + '.') || key.startsWith(prefix + '[')) {
        if (!match || prefix.length > match.prefix.length) {
          match = { section, prefix };
        }
      }
    }
  }
  return match?.section;
}

/** Return the section ids that carry at least one error key. */
export function sectionsWithErrors(errors: Record<string, string>): Set<WizardSectionId> {
  const out = new Set<WizardSectionId>();
  for (const key of Object.keys(errors)) {
    const section = findSectionForKey(key);
    if (section) out.add(section.id);
  }
  return out;
}

/**
 * Best-effort scroll handler: resolves a validator error key to a scrollable
 * element via the per-section `fieldIds` map (data-test-subj) or falls back
 * to the section anchor. Returns `true` when a scroll happened.
 */
export function scrollToErrorKey(key: string): boolean {
  const section = findSectionForKey(key);
  if (!section) return false;
  const fieldId = section.fieldIds?.[key];
  if (fieldId) {
    const el = document.querySelector<HTMLElement>(`[data-test-subj="${fieldId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
      return true;
    }
  }
  const anchor = document.getElementById(section.anchorId);
  if (anchor) {
    anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  return false;
}

/** Human-friendly label for an error key, scoped by section. */
export function labelForErrorKey(key: string): string {
  const section = findSectionForKey(key);
  return section ? `${section.label} — ${key}` : key;
}
