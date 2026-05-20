/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { OrphanIntegrityBadge } from '../orphan_integrity_badge';

describe('OrphanIntegrityBadge', () => {
  it('renders the "Ready to adopt" label for ok integrity', () => {
    render(<OrphanIntegrityBadge integrity="ok" />);
    expect(screen.getByText('Ready to adopt')).toBeInTheDocument();
    expect(screen.getByTestId('sloAdoption-integrityBadge-ok')).toBeInTheDocument();
  });

  it('renders the warning label for mismatch integrity', () => {
    render(<OrphanIntegrityBadge integrity="mismatch" />);
    expect(screen.getByText('Spec drift detected')).toBeInTheDocument();
    expect(screen.getByTestId('sloAdoption-integrityBadge-mismatch')).toBeInTheDocument();
  });

  it('renders the danger label for unsupported_schema integrity', () => {
    render(<OrphanIntegrityBadge integrity="unsupported_schema" />);
    expect(screen.getByText('Unknown schema')).toBeInTheDocument();
    expect(screen.getByTestId('sloAdoption-integrityBadge-unsupported_schema')).toBeInTheDocument();
  });

  it('appends the test-subj suffix when provided', () => {
    render(<OrphanIntegrityBadge integrity="ok" testSubjSuffix="row-42" />);
    expect(screen.getByTestId('sloAdoption-integrityBadge-ok-row-42')).toBeInTheDocument();
  });
});
