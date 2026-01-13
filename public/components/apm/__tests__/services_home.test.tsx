/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Services } from '../services_home';

// Mock child components
jest.mock('../config/apm_settings_modal', () => ({
  ApmSettingsModal: jest.fn(({ onClose }) => (
    <div data-test-subj="apm-settings-modal">
      <button data-test-subj="modal-close" onClick={() => onClose(false)}>
        Close
      </button>
      <button data-test-subj="modal-save" onClick={() => onClose(true)}>
        Save
      </button>
    </div>
  )),
}));

jest.mock('../common/apm_empty_state', () => ({
  ApmEmptyState: jest.fn(({ onGetStartedClick }) => (
    <div data-test-subj="apm-empty-state">
      <button onClick={onGetStartedClick}>Get Started</button>
    </div>
  )),
}));

jest.mock('../pages/services_home', () => ({
  ServicesHome: jest.fn(({ onServiceClick }) => (
    <div data-test-subj="services-home">
      <button onClick={() => onServiceClick('test-service', 'prod')}>Test Service</button>
    </div>
  )),
}));

jest.mock('../../../plugin_helpers/plugin_headerControl', () => ({
  HeaderControlledComponentsWrapper: jest.fn(({ components }) => (
    <div data-test-subj="header-wrapper">{components}</div>
  )),
}));

// Mock the APM config context
const mockRefresh = jest.fn();
jest.mock('../config/apm_config_context', () => ({
  useApmConfig: jest.fn(),
}));

import { useApmConfig } from '../config/apm_config_context';

describe('Services', () => {
  const mockChrome = {
    setBreadcrumbs: jest.fn(),
  };

  const mockNotifications = {
    toasts: {
      addSuccess: jest.fn(),
      addError: jest.fn(),
    },
  };

  const defaultProps = {
    chrome: mockChrome,
    parentBreadcrumb: { text: 'APM', href: '#/' },
    notifications: mockNotifications as unknown,
    CoreStartProp: {} as unknown,
    DepsStart: {} as unknown,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window.location.href mock
    delete (window as any).location;
    (window as any).location = { href: '' };
  });

  describe('Loading State', () => {
    it('should show loading spinner when loading', () => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: null,
        loading: true,
        refresh: mockRefresh,
      });

      const { container } = render(<Services {...defaultProps} />);

      // EuiLoadingSpinner renders a span with euiLoadingSpinner class
      expect(container.querySelector('.euiLoadingSpinner')).toBeInTheDocument();
    });

    it('should not render ApmEmptyState while loading', () => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: null,
        loading: true,
        refresh: mockRefresh,
      });

      render(<Services {...defaultProps} />);

      expect(screen.queryByTestId('apm-empty-state')).not.toBeInTheDocument();
    });

    it('should not render ServicesHome while loading', () => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: { some: 'config' },
        loading: true,
        refresh: mockRefresh,
      });

      render(<Services {...defaultProps} />);

      expect(screen.queryByTestId('services-home')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    beforeEach(() => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: null,
        loading: false,
        refresh: mockRefresh,
      });
    });

    it('should render ApmEmptyState when no config', () => {
      render(<Services {...defaultProps} />);

      expect(screen.getByTestId('apm-empty-state')).toBeInTheDocument();
    });

    it('should render APM Settings button', () => {
      render(<Services {...defaultProps} />);

      expect(screen.getByText('APM Settings')).toBeInTheDocument();
    });

    it('should open modal when Get Started is clicked', () => {
      render(<Services {...defaultProps} />);

      expect(screen.queryByTestId('apm-settings-modal')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Get Started' }));

      expect(screen.getByTestId('apm-settings-modal')).toBeInTheDocument();
    });

    it('should open modal when APM Settings button is clicked', () => {
      render(<Services {...defaultProps} />);

      fireEvent.click(screen.getByText('APM Settings'));

      expect(screen.getByTestId('apm-settings-modal')).toBeInTheDocument();
    });
  });

  describe('Normal State', () => {
    beforeEach(() => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: {
          serviceMapDataset: { id: 'test', title: 'test-index' },
        },
        loading: false,
        refresh: mockRefresh,
      });
    });

    it('should render ServicesHome when config exists', () => {
      render(<Services {...defaultProps} />);

      expect(screen.getByTestId('services-home')).toBeInTheDocument();
    });

    it('should render APM Settings button', () => {
      render(<Services {...defaultProps} />);

      expect(screen.getByText('APM Settings')).toBeInTheDocument();
    });

    it('should open modal when APM Settings is clicked', () => {
      render(<Services {...defaultProps} />);

      fireEvent.click(screen.getByText('APM Settings'));

      expect(screen.getByTestId('apm-settings-modal')).toBeInTheDocument();
    });
  });

  describe('Modal Behavior', () => {
    beforeEach(() => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: null,
        loading: false,
        refresh: mockRefresh,
      });
    });

    it('should close modal without refresh when closed without save', async () => {
      render(<Services {...defaultProps} />);

      // Open modal
      fireEvent.click(screen.getByText('APM Settings'));
      expect(screen.getByTestId('apm-settings-modal')).toBeInTheDocument();

      // Close without save
      fireEvent.click(screen.getByTestId('modal-close'));

      await waitFor(() => {
        expect(screen.queryByTestId('apm-settings-modal')).not.toBeInTheDocument();
      });
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('should close modal and refresh when saved', async () => {
      render(<Services {...defaultProps} />);

      // Open modal
      fireEvent.click(screen.getByText('APM Settings'));

      // Save
      fireEvent.click(screen.getByTestId('modal-save'));

      await waitFor(() => {
        expect(screen.queryByTestId('apm-settings-modal')).not.toBeInTheDocument();
      });
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('Breadcrumbs', () => {
    it('should set breadcrumbs on mount', () => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: null,
        loading: false,
        refresh: mockRefresh,
      });

      render(<Services {...defaultProps} />);

      expect(mockChrome.setBreadcrumbs).toHaveBeenCalledWith([
        { text: 'Services', href: '#/services' },
      ]);
    });
  });

  describe('Service Navigation', () => {
    it('should navigate to service details when service is clicked', () => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: { serviceMapDataset: { id: 'test', title: 'test-index' } },
        loading: false,
        refresh: mockRefresh,
      });

      render(<Services {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Test Service' }));

      expect(window.location.href).toBe('#/service-details/test-service/prod');
    });

    it('should encode service name and environment in URL', () => {
      (useApmConfig as jest.Mock).mockReturnValue({
        config: { serviceMapDataset: { id: 'test', title: 'test-index' } },
        loading: false,
        refresh: mockRefresh,
      });

      // Mock ServicesHome to use special characters
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ServicesHome } = require('../pages/services_home');
      ServicesHome.mockImplementation(
        ({ onServiceClick }: { onServiceClick: (name: string, env: string) => void }) => (
          <div data-test-subj="services-home">
            <button onClick={() => onServiceClick('service/with/slashes', 'env with spaces')}>
              Special Service
            </button>
          </div>
        )
      );

      render(<Services {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: 'Special Service' }));

      expect(window.location.href).toContain(encodeURIComponent('service/with/slashes'));
      expect(window.location.href).toContain(encodeURIComponent('env with spaces'));
    });
  });
});
