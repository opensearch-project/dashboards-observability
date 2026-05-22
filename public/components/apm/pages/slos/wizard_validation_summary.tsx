/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Top-of-form "fix these errors" summary. Only renders after the user has
 * clicked Create at least once — typing doesn't produce a sea of red; the
 * explicit attempt does.
 *
 * Each row is an EuiLink that scrolls to the offending field (falling back
 * to the section anchor if the field isn't individually addressable).
 * Grouping by section mirrors the anchor nav so the two surfaces agree on
 * what "belongs" where.
 */

import React from 'react';
import { EuiCallOut, EuiLink, EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  WIZARD_SECTIONS,
  WizardSection,
  findSectionForKey,
  scrollToErrorKey,
} from './wizard_sections';

export interface WizardValidationSummaryProps {
  errors: Record<string, string>;
}

export const WizardValidationSummary: React.FC<WizardValidationSummaryProps> = ({ errors }) => {
  const keys = Object.keys(errors);
  if (keys.length === 0) return null;

  const grouped = new Map<WizardSection, string[]>();
  const orphans: string[] = [];
  for (const key of keys) {
    const section = findSectionForKey(key);
    if (!section) {
      orphans.push(key);
      continue;
    }
    const list = grouped.get(section) ?? [];
    list.push(key);
    grouped.set(section, list);
  }

  return (
    <>
      <EuiCallOut
        color="danger"
        iconType="alert"
        title={i18n.translate('observability.apm.slo.wizard.validationSummary.title', {
          defaultMessage:
            'Fix {count, plural, one {# error} other {# errors}} before creating the SLO',
          values: { count: keys.length },
        })}
        data-test-subj="slosWizardValidationSummary"
      >
        <EuiText size="s">
          <ul data-test-subj="slosWizardValidationSummaryList">
            {WIZARD_SECTIONS.map((section) => {
              const sectionKeys = grouped.get(section);
              if (!sectionKeys || sectionKeys.length === 0) return null;
              return sectionKeys.map((key) => (
                <li key={key}>
                  <EuiLink
                    onClick={() => scrollToErrorKey(key)}
                    data-test-subj={`slosWizardValidationSummaryItem-${key}`}
                  >
                    <strong>{section.label}:</strong> {errors[key]}
                  </EuiLink>
                </li>
              ));
            })}
            {orphans.map((key) => (
              <li key={key}>
                <EuiLink
                  onClick={() => scrollToErrorKey(key)}
                  data-test-subj={`slosWizardValidationSummaryItem-${key}`}
                >
                  {key}: {errors[key]}
                </EuiLink>
              </li>
            ))}
          </ul>
        </EuiText>
      </EuiCallOut>
      <EuiSpacer size="m" />
    </>
  );
};
