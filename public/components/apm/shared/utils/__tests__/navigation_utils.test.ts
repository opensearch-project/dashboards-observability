/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  navigateToServiceMap,
  navigateToExploreTraces,
  navigateToSpanDetails,
  navigateToExploreLogs,
  navigateToDatasetCorrelations,
} from '../navigation_utils';
import { coreRefs } from '../../../../../framework/core_refs';

// Mock coreRefs
jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    http: {
      basePath: {
        prepend: jest.fn((path: string) => `/base${path}`),
      },
    },
  },
}));

describe('navigation_utils', () => {
  let windowOpenSpy: jest.SpyInstance;
  const originalLocation = window.location;

  beforeEach(() => {
    jest.clearAllMocks();
    windowOpenSpy = jest.spyOn(window, 'open').mockImplementation();

    // Mock window.location.href
    delete (window as any).location;
    window.location = { href: '' } as Location;
  });

  afterEach(() => {
    windowOpenSpy.mockRestore();
    window.location = originalLocation;
  });

  describe('navigateToServiceMap', () => {
    it('should be a placeholder function that does nothing', () => {
      // This is a TODO function - just ensure it doesn't throw
      expect(() => navigateToServiceMap('test-service', 'production')).not.toThrow();
    });
  });

  describe('navigateToExploreTraces', () => {
    const defaultParams = {
      datasetId: 'test-dataset',
      datasetTitle: 'Test Dataset',
      serviceName: 'test-service',
      timeRange: { from: 'now-1h', to: 'now' },
      dataSourceId: 'ds-123',
      dataSourceTitle: 'Test DataSource',
    };

    it('should open traces URL in new tab', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(windowOpenSpy).toHaveBeenCalledTimes(1);
      expect(windowOpenSpy).toHaveBeenCalledWith(expect.any(String), '_blank');
    });

    it('should use basePath.prepend for URL construction', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(coreRefs.http?.basePath.prepend).toHaveBeenCalled();
      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('/base/app/explore/traces/');
    });

    it('should include service name in PPL query', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      // PPL query is URL encoded
      expect(url).toContain(encodeURIComponent('| where serviceName = "test-service"'));
    });

    it('should include time range in URL', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('from:now-1h');
      expect(url).toContain('to:now');
    });

    it('should handle datasetId with existing :: prefix', () => {
      navigateToExploreTraces(
        'ds-123::existing-dataset',
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      // Should not double-prefix the datasetId
      expect(url).toContain("id:'ds-123::existing-dataset'");
      expect(url).not.toContain('::ds-123::existing-dataset');
    });

    it('should prefix datasetId when not already prefixed', () => {
      navigateToExploreTraces(
        'test-dataset',
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        'ds-456',
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain("id:'ds-456::test-dataset'");
    });

    it('should handle missing dataSourceTitle', () => {
      navigateToExploreTraces(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        undefined
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain("title:''");
    });
  });

  describe('navigateToSpanDetails', () => {
    const defaultParams = {
      datasetId: 'test-dataset',
      datasetTitle: 'Test Dataset',
      spanId: 'span-123',
      traceId: 'trace-456',
      dataSourceId: 'ds-123',
      dataSourceTitle: 'Test DataSource',
    };

    it('should open span details URL in new tab', () => {
      navigateToSpanDetails(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.spanId,
        defaultParams.traceId,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(windowOpenSpy).toHaveBeenCalledTimes(1);
      expect(windowOpenSpy).toHaveBeenCalledWith(expect.any(String), '_blank');
    });

    it('should include spanId and traceId in URL', () => {
      navigateToSpanDetails(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.spanId,
        defaultParams.traceId,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain("spanId:'span-123'");
      expect(url).toContain("traceId:'trace-456'");
    });

    it('should use basePath.prepend for URL construction', () => {
      navigateToSpanDetails(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.spanId,
        defaultParams.traceId,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(coreRefs.http?.basePath.prepend).toHaveBeenCalled();
      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('/base/app/explore/traces/traceDetails');
    });

    it('should handle datasetId with existing :: prefix', () => {
      navigateToSpanDetails(
        'ds-123::existing-dataset',
        defaultParams.datasetTitle,
        defaultParams.spanId,
        defaultParams.traceId,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain("id:'ds-123::existing-dataset'");
      expect(url).not.toContain('::ds-123::existing-dataset');
    });
  });

  describe('navigateToExploreLogs', () => {
    const defaultParams = {
      datasetId: 'logs-dataset',
      datasetTitle: 'Logs Dataset',
      serviceName: 'test-service',
      serviceNameField: 'resource.attributes.service.name',
      timeRange: { from: 'now-1h', to: 'now' },
      dataSourceId: 'ds-123',
      dataSourceTitle: 'Test DataSource',
    };

    it('should open logs URL in new tab', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(windowOpenSpy).toHaveBeenCalledTimes(1);
      expect(windowOpenSpy).toHaveBeenCalledWith(expect.any(String), '_blank');
    });

    it('should use basePath.prepend for URL construction', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      expect(coreRefs.http?.basePath.prepend).toHaveBeenCalled();
      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('/base/app/explore/logs/');
    });

    it('should include service name filter in PPL query', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      // PPL query uses backticks for field name and is URL encoded
      expect(url).toContain(
        encodeURIComponent('| where `resource.attributes.service.name` = "test-service"')
      );
    });

    it('should include time range in URL', () => {
      navigateToExploreLogs(
        defaultParams.datasetId,
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain('from:now-1h');
      expect(url).toContain('to:now');
    });

    it('should handle datasetId with existing :: prefix', () => {
      navigateToExploreLogs(
        'ds-123::existing-logs',
        defaultParams.datasetTitle,
        defaultParams.serviceName,
        defaultParams.serviceNameField,
        defaultParams.timeRange,
        defaultParams.dataSourceId,
        defaultParams.dataSourceTitle
      );

      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toContain("id:'ds-123::existing-logs'");
      expect(url).not.toContain('::ds-123::existing-logs');
    });
  });

  describe('navigateToDatasetCorrelations', () => {
    it('should navigate in same tab using window.location.href', () => {
      navigateToDatasetCorrelations('test-dataset');

      expect(window.location.href).toContain('/base/app/datasets/patterns/');
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it('should use basePath.prepend for URL construction', () => {
      navigateToDatasetCorrelations('test-dataset');

      expect(coreRefs.http?.basePath.prepend).toHaveBeenCalled();
    });

    it('should encode datasetId in URL', () => {
      navigateToDatasetCorrelations('ds-123::test-dataset');

      expect(window.location.href).toContain(encodeURIComponent('ds-123::test-dataset'));
    });

    it('should navigate to correlatedDatasets tab', () => {
      navigateToDatasetCorrelations('test-dataset');

      expect(window.location.href).toContain('tab:correlatedDatasets');
    });
  });
});
