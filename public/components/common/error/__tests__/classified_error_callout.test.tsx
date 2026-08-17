/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ClassifiedErrorCallout } from '../classified_error_callout';
import type { ClassifiedError } from '../../../../../common/error';

function classified(overrides: Partial<ClassifiedError> = {}): ClassifiedError {
  return {
    category: 'VALIDATION',
    code: 'RULE_CONFIG_INVALID',
    title: 'Alert rule is invalid',
    message: 'The alert rule was rejected because its configuration is invalid.',
    remediation: 'Correct the highlighted fields and resubmit.',
    retryable: false,
    correlationId: 'cid-42',
    ...overrides,
  };
}

describe('ClassifiedErrorCallout', () => {
  it('renders title, message, remediation and (for escalation categories) the correlation id', () => {
    render(
      <ClassifiedErrorCallout
        error={classified({
          category: 'UPSTREAM_UNAVAILABLE',
          code: 'RULE_BACKEND_UNAVAILABLE',
        })}
      />
    );
    expect(screen.getByText('Alert rule is invalid')).toBeInTheDocument();
    expect(
      screen.getByText('The alert rule was rejected because its configuration is invalid.')
    ).toBeInTheDocument();
    expect(screen.getByText('Correct the highlighted fields and resubmit.')).toBeInTheDocument();
    expect(screen.getByTestId('classifiedErrorCorrelationId')).toHaveTextContent('cid-42');
  });

  it('omits the correlation id for self-serviceable categories (e.g. VALIDATION)', () => {
    render(<ClassifiedErrorCallout error={classified({ category: 'VALIDATION' })} />);
    expect(screen.queryByTestId('classifiedErrorCorrelationId')).not.toBeInTheDocument();
  });

  it('shows a safe-details accordion and omits raw details when none are exposed', () => {
    render(
      <ClassifiedErrorCallout
        error={classified({
          details: [
            {
              key: 'redactedDetail',
              label: 'Details',
              value: 'invalid PromQL: parse error',
              sensitivity: 'safe',
            },
          ],
        })}
      />
    );
    expect(screen.getByTestId('classifiedErrorSafeDetails')).toBeInTheDocument();
    expect(screen.queryByTestId('classifiedErrorRawDetails')).not.toBeInTheDocument();
  });

  it('shows a raw-details accordion when sensitive details are exposed', () => {
    render(
      <ClassifiedErrorCallout
        error={classified({
          details: [
            {
              key: 'rawDetail',
              label: 'Raw error details',
              value: 'verbatim upstream body',
              sensitivity: 'sensitive',
            },
          ],
        })}
      />
    );
    expect(screen.getByTestId('classifiedErrorRawDetails')).toBeInTheDocument();
  });
});
