/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiCallOut, EuiCode, EuiLink, EuiText, EuiSpacer } from '@elastic/eui';
import { i18n } from '@osd/i18n';

export interface RequirementCalloutProps {
  /** Callout title. */
  title: string;
  /** Index naming convention required (rendered as code). */
  pattern?: string;
  /** Required field names (rendered as code chips). */
  requiredFields?: readonly string[];
  /** Optional documentation link. */
  docsUrl?: string;
  /** EUI callout color; defaults to a neutral primary info banner. */
  color?: 'primary' | 'success' | 'warning' | 'danger';
  /** EUI icon type; defaults based on color. */
  iconType?: string;
  /** Optional extra content rendered below the requirement list. */
  children?: React.ReactNode;
}

/**
 * Reusable "required mappings + documentation" callout shown on each wizard
 * step. Lists the naming convention and the fields that must exist, with an
 * optional docs link. Purely presentational.
 */
export const RequirementCallout = ({
  title,
  pattern,
  requiredFields,
  docsUrl,
  color = 'primary',
  iconType = 'iInCircle',
  children,
}: RequirementCalloutProps) => {
  return (
    <EuiCallOut title={title} color={color} iconType={iconType} size="s">
      <EuiText size="s">
        {pattern && (
          <p>
            {i18n.translate('observability.apm.setupWizard.requirement.patternLabel', {
              defaultMessage: 'Index pattern: ',
            })}
            <EuiCode>{pattern}</EuiCode>
          </p>
        )}
        {requiredFields && requiredFields.length > 0 && (
          <p>
            {i18n.translate('observability.apm.setupWizard.requirement.fieldsLabel', {
              defaultMessage: 'Required fields: ',
            })}
            {requiredFields.map((field, index) => (
              <React.Fragment key={field}>
                {index > 0 && ', '}
                <EuiCode>{field}</EuiCode>
              </React.Fragment>
            ))}
          </p>
        )}
        {children}
        {docsUrl && (
          <p>
            <EuiLink href={docsUrl} target="_blank" external>
              {i18n.translate('observability.apm.setupWizard.requirement.learnMore', {
                defaultMessage: 'Learn more',
              })}
            </EuiLink>
          </p>
        )}
      </EuiText>
      <EuiSpacer size="xs" />
    </EuiCallOut>
  );
};
