/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ApmConfigProvider, useApmConfig } from '../apm_config_context';
import { OSDSavedApmConfigClient } from '../../../../services/saved_objects/saved_object_client/osd_saved_objects/apm_config';

// Mock the OSDSavedApmConfigClient
jest.mock(
  '../../../../services/saved_objects/saved_object_client/osd_saved_objects/apm_config',
  () => ({
    OSDSavedApmConfigClient: {
      getInstance: jest.fn(),
    },
  })
);

describe('ApmConfigContext', () => {
  const mockGetBulkWithResolvedReferences = jest.fn();
  const mockDataService = {
    dataViews: {
      get: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (OSDSavedApmConfigClient.getInstance as jest.Mock).mockReturnValue({
      getBulkWithResolvedReferences: mockGetBulkWithResolvedReferences,
    });
  });

  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <ApmConfigProvider dataService={mockDataService as any}>{children}</ApmConfigProvider>
  );

  describe('useApmConfig hook', () => {
    it('should throw error when used outside of provider', () => {
      // Suppress console.error for this test since we expect an error
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useApmConfig());
      }).toThrow('useApmConfig must be used within an ApmConfigProvider');

      spy.mockRestore();
    });

    it('should return initial loading state', () => {
      mockGetBulkWithResolvedReferences.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useApmConfig(), { wrapper });

      expect(result.current.loading).toBe(true);
      expect(result.current.config).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should return config when fetch succeeds', async () => {
      const mockConfig = {
        objectId: 'test-id',
        tracesDataset: { id: 'traces-1', title: 'Traces' },
        serviceMapDataset: { id: 'services-1', title: 'Services' },
        prometheusDataSource: { id: 'prom-1', title: 'Prometheus' },
      };

      mockGetBulkWithResolvedReferences.mockResolvedValue({
        configs: [mockConfig],
        total: 1,
      });

      const { result } = renderHook(() => useApmConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.config).toEqual(mockConfig);
      expect(result.current.error).toBeNull();
    });

    it('should return null config when no configs exist', async () => {
      mockGetBulkWithResolvedReferences.mockResolvedValue({
        configs: [],
        total: 0,
      });

      const { result } = renderHook(() => useApmConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.config).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should set error when fetch fails', async () => {
      const mockError = new Error('Failed to fetch config');
      mockGetBulkWithResolvedReferences.mockRejectedValue(mockError);

      const { result } = renderHook(() => useApmConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.config).toBeNull();
      expect(result.current.error).toEqual(mockError);
    });

    it('should convert non-Error objects to Error', async () => {
      mockGetBulkWithResolvedReferences.mockRejectedValue('String error');

      const { result } = renderHook(() => useApmConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('String error');
    });

    it('should refresh config when refresh is called', async () => {
      mockGetBulkWithResolvedReferences.mockResolvedValue({
        configs: [],
        total: 0,
      });

      const { result } = renderHook(() => useApmConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockGetBulkWithResolvedReferences.mockClear();
      mockGetBulkWithResolvedReferences.mockResolvedValue({
        configs: [{ objectId: 'new-config' }],
        total: 1,
      });

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGetBulkWithResolvedReferences).toHaveBeenCalledTimes(1);
      expect(result.current.config).toEqual({ objectId: 'new-config' });
    });
  });

  describe('ApmConfigProvider', () => {
    it('should pass dataService to getBulkWithResolvedReferences', async () => {
      mockGetBulkWithResolvedReferences.mockResolvedValue({
        configs: [],
        total: 0,
      });

      const { result } = renderHook(() => useApmConfig(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGetBulkWithResolvedReferences).toHaveBeenCalledWith(mockDataService);
    });
  });
});
