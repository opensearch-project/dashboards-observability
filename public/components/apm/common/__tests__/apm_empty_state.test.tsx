/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApmEmptyState } from '../apm_empty_state';

// Mock the image imports
jest.mock('../assets/services-preview.jpg', () => 'mock-services-preview.jpg');
jest.mock('../assets/application-map-preview.jpg', () => 'mock-application-map-preview.jpg');
jest.mock('../assets/correlate-traces-preview.jpg', () => 'mock-correlate-traces-preview.jpg');

describe('ApmEmptyState', () => {
  const mockOnGetStartedClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the title', () => {
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    expect(screen.getByText('Start monitoring applications with OpenSearch')).toBeInTheDocument();
  });

  it('should render Get started button', () => {
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    const button = screen.getByRole('button', { name: 'Get started' });
    expect(button).toBeInTheDocument();
  });

  it('should call onGetStartedClick when Get started button is clicked', () => {
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    const button = screen.getByRole('button', { name: 'Get started' });
    fireEvent.click(button);

    expect(mockOnGetStartedClick).toHaveBeenCalledTimes(1);
  });

  it('should render documentation link', () => {
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    const link = screen.getByText('View documentation');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'https://docs.opensearch.org/latest/observing-your-data/'
    );
  });

  it('should render all tabs', () => {
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Application Map')).toBeInTheDocument();
    expect(screen.getByText('Correlate traces and logs')).toBeInTheDocument();
  });

  it('should show Services tab as selected by default', () => {
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    const servicesButton = screen.getByTestId('services');
    expect(servicesButton).toBeChecked();
  });

  it('should show Services description by default', () => {
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    expect(
      screen.getByText(/Monitor service health, latency, and error rates/)
    ).toBeInTheDocument();
  });

  it('should switch tab and description when clicking another tab', async () => {
    const user = userEvent.setup();
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    const applicationMapButton = screen.getByTestId('application-map');
    await user.click(applicationMapButton);

    expect(applicationMapButton).toBeChecked();
    expect(screen.getByText(/Visualize service dependencies and topology/)).toBeInTheDocument();
  });

  it('should update preview image alt text when switching tabs', async () => {
    const user = userEvent.setup();
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    // Default is Services
    expect(screen.getByAltText('Services preview')).toBeInTheDocument();

    // Click Application Map button
    const applicationMapButton = screen.getByTestId('application-map');
    await user.click(applicationMapButton);
    expect(screen.getByAltText('Application Map preview')).toBeInTheDocument();
  });

  it('should render preview image', () => {
    render(<ApmEmptyState onGetStartedClick={mockOnGetStartedClick} />);

    const image = screen.getByRole('img', { name: 'Services preview' });
    expect(image).toBeInTheDocument();
  });
});
