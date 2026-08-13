/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Toast body for a classified error, plus the modal it opens.
 *
 * The toast shows the plain-language message and a "See the full error" link.
 * Clicking it opens a modal (via the overlays service) with the exact, fully
 * unwrapped upstream diagnostic (e.g. an upstream query parse error) in a
 * scrollable, copyable code block — matching the Discover "Search Error"
 * pattern. Render the body into an OSD toast via
 * `toMountPoint(<ClassifiedErrorToastBody .../>)`.
 */

import React from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiCodeBlock,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { toMountPoint } from '../../../../../../src/plugins/opensearch_dashboards_react/public';
import { coreRefs } from '../../../framework/core_refs';
import type { ClassifiedError } from '../../../../common/error';
import { shouldShowCorrelationReference } from './extract';

/** The full, copyable error body: the unwrapped `safe` diagnostic(s) + reference. */
export function fullErrorText(error: ClassifiedError): string {
  const parts: string[] = [];
  for (const d of error.details ?? []) {
    if (d.sensitivity === 'safe' && d.value) parts.push(d.value);
  }
  if (shouldShowCorrelationReference(error) && error.correlationId) {
    parts.push(`Reference: ${error.correlationId}`);
  }
  return parts.join('\n\n');
}

export interface ClassifiedErrorModalProps {
  error: ClassifiedError;
  onClose: () => void;
}

/** Modal showing the summary callout + the full, unwrapped error (copyable). */
export const ClassifiedErrorModal: React.FC<ClassifiedErrorModalProps> = ({ error, onClose }) => {
  const full = fullErrorText(error);
  return (
    <EuiModal onClose={onClose} maxWidth={900} data-test-subj="classifiedErrorModal">
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          <h1>{error.title}</h1>
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiCallOut title={error.message} color="danger" iconType="alert" size="s" />
        {error.remediation && (
          <>
            <EuiSpacer size="s" />
            <EuiText size="s">
              <p>{error.remediation}</p>
            </EuiText>
          </>
        )}
        {full && (
          <>
            <EuiSpacer size="s" />
            <EuiCodeBlock
              language="text"
              paddingSize="m"
              fontSize="s"
              isCopyable
              overflowHeight={400}
              whiteSpace="pre-wrap"
              data-test-subj="classifiedErrorModalBody"
            >
              {full}
            </EuiCodeBlock>
          </>
        )}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButton onClick={onClose} fill data-test-subj="classifiedErrorModalClose">
          {i18n.translate('observability.error.modal.close', {
            defaultMessage: 'Close',
          })}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};

export interface ClassifiedErrorToastBodyProps {
  error: ClassifiedError;
}

export const ClassifiedErrorToastBody: React.FC<ClassifiedErrorToastBodyProps> = ({ error }) => {
  const hasFull = Boolean(fullErrorText(error));

  const openFullError = () => {
    const overlays = coreRefs.overlays;
    if (!overlays) return;
    const ref = overlays.openModal(
      toMountPoint(<ClassifiedErrorModal error={error} onClose={() => ref.close()} />)
    );
  };

  return (
    <EuiText size="s" data-test-subj="classifiedErrorToastBody">
      <p>{error.message}</p>
      {hasFull && (
        <>
          <EuiSpacer size="s" />
          <div style={{ textAlign: 'right' }}>
            <EuiButton
              size="s"
              color="danger"
              onClick={openFullError}
              data-test-subj="classifiedErrorToastSeeFullError"
            >
              {i18n.translate('observability.error.toast.seeFullError', {
                defaultMessage: 'See the full error',
              })}
            </EuiButton>
          </div>
        </>
      )}
    </EuiText>
  );
};
