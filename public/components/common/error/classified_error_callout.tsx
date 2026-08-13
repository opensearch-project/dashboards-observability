/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Inline callout variant of a classified error, for form/detail pages. Mirrors
 * the existing alerting callout patterns (danger/warning `EuiCallOut`, small
 * size, data-test-subj). Safe details are shown behind a "View details"
 * accordion; raw (`sensitive`) details — present only when an operator/fork
 * opted into exposure — get their own clearly-labeled accordion.
 */

import React from 'react';
import { EuiAccordion, EuiCallOut, EuiCodeBlock, EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { ClassifiedError } from '../../../../common/error';
import { classifiedToastColor, shouldShowCorrelationReference } from './extract';

export interface ClassifiedErrorCalloutProps {
  error: ClassifiedError;
  dataTestSubj?: string;
}

export const ClassifiedErrorCallout: React.FC<ClassifiedErrorCalloutProps> = ({
  error,
  dataTestSubj = 'classifiedErrorCallout',
}) => {
  const color = classifiedToastColor(error);
  const safe = (error.details ?? []).filter((d) => d.sensitivity === 'safe' && d.value);
  const sensitive = (error.details ?? []).filter((d) => d.sensitivity === 'sensitive' && d.value);

  return (
    <EuiCallOut
      title={error.title}
      color={color}
      iconType="alert"
      size="s"
      data-test-subj={dataTestSubj}
    >
      <EuiText size="s">
        <p>{error.message}</p>
      </EuiText>
      {error.remediation && (
        <EuiText size="s">
          <p>{error.remediation}</p>
        </EuiText>
      )}

      {safe.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`classifiedError-details-${error.code}`}
            buttonContent={i18n.translate('observability.error.callout.viewDetails', {
              defaultMessage: 'View details',
            })}
            data-test-subj="classifiedErrorSafeDetails"
          >
            {safe.map((detail, idx) => (
              <EuiCodeBlock key={idx} paddingSize="s" fontSize="s" isCopyable>
                {`${detail.label}: ${detail.value}`}
              </EuiCodeBlock>
            ))}
          </EuiAccordion>
        </>
      )}

      {sensitive.length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`classifiedError-raw-${error.code}`}
            buttonContent={i18n.translate('observability.error.callout.rawDetails', {
              defaultMessage: 'Raw error details (may contain internal detail)',
            })}
            data-test-subj="classifiedErrorRawDetails"
          >
            {sensitive.map((detail, idx) => (
              <EuiCodeBlock key={idx} paddingSize="s" fontSize="s" isCopyable>
                {detail.value}
              </EuiCodeBlock>
            ))}
          </EuiAccordion>
        </>
      )}

      {shouldShowCorrelationReference(error) && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs" color="subdued">
            <p data-test-subj="classifiedErrorCorrelationId">
              {i18n.translate('observability.error.callout.reference', {
                defaultMessage: 'Reference: {id}',
                values: { id: error.correlationId },
              })}
            </p>
          </EuiText>
        </>
      )}
    </EuiCallOut>
  );
};
