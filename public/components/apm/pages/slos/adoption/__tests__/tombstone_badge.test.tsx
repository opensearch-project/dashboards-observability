/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TombstoneBadge } from '../tombstone_badge';

describe('TombstoneBadge', () => {
  it('renders the "Deliberately deleted" label with a date when provided', () => {
    render(<TombstoneBadge createdAt="2025-06-10T12:00:00Z" onConfirm={jest.fn()} />);
    expect(screen.getByText(/Deliberately deleted 2025-06-10/)).toBeInTheDocument();
  });

  it('renders the fallback label when createdAt is omitted', () => {
    render(<TombstoneBadge onConfirm={jest.fn()} />);
    expect(screen.getByText('Deliberately deleted')).toBeInTheDocument();
  });

  it('opens the confirmation modal when the badge is clicked', () => {
    render(<TombstoneBadge createdAt="2025-06-10T00:00:00Z" onConfirm={jest.fn()} />);
    fireEvent.click(screen.getByTestId('sloAdoption-tombstoneBadge'));
    expect(screen.getByText(/This SLO was deliberately deleted/)).toBeInTheDocument();
  });

  it('invokes onConfirm only when the confirm button is clicked', () => {
    const onConfirm = jest.fn();
    render(<TombstoneBadge createdAt="2025-06-10T00:00:00Z" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('sloAdoption-tombstoneBadge'));
    act(() => {
      fireEvent.click(screen.getByTestId('sloAdoption-tombstoneBadge-confirm'));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes the modal without firing onConfirm when cancel is clicked', () => {
    const onConfirm = jest.fn();
    render(<TombstoneBadge createdAt="2025-06-10T00:00:00Z" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('sloAdoption-tombstoneBadge'));
    act(() => {
      fireEvent.click(screen.getByTestId('sloAdoption-tombstoneBadge-cancel'));
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText(/This SLO was deliberately deleted/)).not.toBeInTheDocument();
  });

  it('does not open the modal when disabled', () => {
    render(
      <TombstoneBadge createdAt="2025-06-10T00:00:00Z" onConfirm={jest.fn()} disabled={true} />
    );
    fireEvent.click(screen.getByTestId('sloAdoption-tombstoneBadge'));
    expect(screen.queryByText(/This SLO was deliberately deleted/)).not.toBeInTheDocument();
  });
});
