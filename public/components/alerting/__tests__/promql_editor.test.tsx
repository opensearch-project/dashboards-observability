/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('../../../../common/services/alerting/promql_validator', () => ({
  validatePromQL: jest.fn().mockReturnValue({ errors: [], warnings: [] }),
  prettifyPromQL: jest.fn((q: string) => q),
}));

import { PromQLEditor } from '../promql_editor';

describe('PromQLEditor', () => {
  it('renders the textarea with aria-label', () => {
    render(<PromQLEditor value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText('PromQL query editor')).toBeInTheDocument();
  });

  it('displays the initial value in the editor', () => {
    const query = 'rate(http_requests_total[5m])';
    render(<PromQLEditor value={query} onChange={jest.fn()} />);
    const textarea = screen.getByLabelText('PromQL query editor') as HTMLTextAreaElement;
    expect(textarea.value).toBe(query);
  });
});
