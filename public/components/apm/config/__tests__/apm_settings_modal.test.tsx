/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { ApmSettingsModal } from '../apm_settings_modal';
import { ApmConfigProvider } from '../apm_config_context';
import { OSDSavedApmConfigClient } from '../../../../services/saved_objects/saved_object_client/osd_saved_objects/apm_config';

// Mock dependencies
jest.mock(
  '../../../../services/saved_objects/saved_object_client/osd_saved_objects/apm_config',
  () => ({
    OSDSavedApmConfigClient: {
      getInstance: jest.fn(),
    },
  })
);

jest.mock('../../../../../../../src/core/public/utils', () => ({
  getWorkspaceIdFromUrl: jest.fn().mockReturnValue('test-workspace-id'),
}));

jest.mock('../../shared/hooks/use_apm_config', () => ({
  useDatasets: jest.fn().mockReturnValue({
    tracesDatasets: [{ label: 'Traces Dataset', value: { id: 'traces-1', title: 'Traces' } }],
    allDatasets: [
      { label: 'Traces Dataset', value: { id: 'traces-1', title: 'Traces' } },
      { label: 'Services Dataset', value: { id: 'services-1', title: 'Services' } },
    ],
    loading: false,
    error: undefined,
    refresh: jest.fn(),
  }),
  usePrometheusDataSources: jest.fn().mockReturnValue({
    data: [{ label: 'Prometheus', value: { id: 'prom-1', title: 'Prometheus' } }],
    loading: false,
    error: undefined,
    refresh: jest.fn(),
  }),
  useCorrelatedLogs: jest.fn().mockReturnValue({
    data: [],
    loading: false,
    error: undefined,
  }),
}));

jest.mock('../apm-architecture-svg', () => ({
  ApmArchitectureSvgLight: '<svg>Light</svg>',
  ApmArchitectureSvgDark: '<svg>Dark</svg>',
}));

describe('ApmSettingsModal', () => {
  const mockOnClose = jest.fn();
  const mockNotifications = {
    toasts: {
      addSuccess: jest.fn(),
      addError: jest.fn(),
      addDanger: jest.fn(),
      addWarning: jest.fn(),
    },
  };
  const mockCoreStart = {
    http: {
      basePath: {
        serverBasePath: '',
      },
    },
    savedObjects: {
      client: {},
    },
    uiSettings: {
      get: jest.fn().mockReturnValue(false),
    },
    application: {
      navigateToApp: jest.fn(),
    },
  };
  const mockDepsStart = {
    data: {
      dataViews: {
        get: jest.fn(),
      },
    },
  };

  const mockGetBulkWithResolvedReferences = jest.fn();
  const mockCreate = jest.fn();
  const mockDelete = jest.fn();

  const defaultProps = {
    onClose: mockOnClose,
    notifications: mockNotifications as any,
    CoreStartProp: mockCoreStart as any,
    DepsStart: mockDepsStart as any,
  };

  const renderWithContext = (props = defaultProps) => {
    return render(
      <ApmConfigProvider dataService={mockDepsStart.data as any}>
        <ApmSettingsModal {...props} />
      </ApmConfigProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBulkWithResolvedReferences.mockResolvedValue({ configs: [], total: 0 });
    mockCreate.mockResolvedValue({ objectId: 'new-config-id' });
    mockDelete.mockResolvedValue({});

    (OSDSavedApmConfigClient.getInstance as jest.Mock).mockReturnValue({
      getBulkWithResolvedReferences: mockGetBulkWithResolvedReferences,
      create: mockCreate,
      delete: mockDelete,
    });
  });

  describe('Rendering', () => {
    it('should render modal title', async () => {
      renderWithContext();

      await waitFor(() => {
        expect(screen.getByText('Application monitoring settings')).toBeInTheDocument();
      });
    });

    it('should render Architecture Diagram accordion', async () => {
      renderWithContext();

      await waitFor(() => {
        expect(screen.getByText('Application Telemetry Flow')).toBeInTheDocument();
      });
    });

    it('should render configuration form section', async () => {
      renderWithContext();

      await waitFor(() => {
        expect(screen.getByText('Configure data for Application Monitoring')).toBeInTheDocument();
      });
    });

    it('should render Traces dropdown', async () => {
      renderWithContext();

      await waitFor(() => {
        expect(screen.getByText('Traces')).toBeInTheDocument();
        expect(screen.getByText('Select dataset for Trace data')).toBeInTheDocument();
      });
    });

    it('should render Services dropdown', async () => {
      renderWithContext();

      await waitFor(() => {
        expect(screen.getByText('Services')).toBeInTheDocument();
        expect(screen.getByText('Select dataset for Services Map data')).toBeInTheDocument();
      });
    });

    it('should render RED Metrics dropdown', async () => {
      renderWithContext();

      await waitFor(() => {
        expect(screen.getByText('RED Metrics')).toBeInTheDocument();
        expect(screen.getByText('Select a Prometheus data source')).toBeInTheDocument();
      });
    });

    it('should render Cancel button', async () => {
      renderWithContext();

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });
    });

    it('should render Apply button when no config exists', async () => {
      renderWithContext();

      await waitFor(() => {
        expect(screen.getByText('Apply')).toBeInTheDocument();
      });
    });
  });

  describe('Cancel behavior', () => {
    it('should call onClose without arguments when Cancel is clicked', async () => {
      renderWithContext();

      await waitFor(() => {
        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);
      });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledWith();
    });

    it('should not trigger refresh when Cancel is clicked', async () => {
      renderWithContext();

      await waitFor(() => {
        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);
      });

      // onClose should be called with no arguments (not true)
      expect(mockOnClose).not.toHaveBeenCalledWith(true);
    });
  });

  describe('Validation', () => {
    it('should show validation errors when Apply is clicked with empty fields', async () => {
      renderWithContext();

      await waitFor(() => {
        const applyButton = screen.getByText('Apply');
        fireEvent.click(applyButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Traces dataset is required')).toBeInTheDocument();
        expect(screen.getByText('Service map dataset is required')).toBeInTheDocument();
        expect(screen.getByText('Prometheus data source is required')).toBeInTheDocument();
      });
    });
  });
});
