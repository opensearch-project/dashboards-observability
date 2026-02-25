/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MLCommonsRCFService } from '../ml_commons_rcf';

describe('MLCommonsRCFService', () => {
  let service: MLCommonsRCFService;
  let mockHttp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHttp = {
      post: jest.fn(),
    };
    service = new MLCommonsRCFService(mockHttp);
  });

  const sampleParams = {
    data: [{ timestamp: '2024-01-01 00:00:00', value: 10 }],
    parameters: {
      time_field: 'timestamp' as const,
    },
  };

  describe('predictAnomalies', () => {
    it('should call http.post with correct URL and body', async () => {
      const mockResponse = { data: { anomalies: [] } };
      mockHttp.post.mockResolvedValue(mockResponse);

      const result = await service.predictAnomalies(sampleParams);

      expect(mockHttp.post).toHaveBeenCalledWith('/api/observability/ml-commons/rcf/predict', {
        body: JSON.stringify(sampleParams),
        query: { dataSourceMDSId: '' },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(result).toBe(mockResponse);
    });

    it('should pass dataSourceMDSId in query when provided', async () => {
      mockHttp.post.mockResolvedValue({});

      await service.predictAnomalies(sampleParams, 'ds-456');

      expect(mockHttp.post).toHaveBeenCalledWith(
        '/api/observability/ml-commons/rcf/predict',
        expect.objectContaining({
          query: { dataSourceMDSId: 'ds-456' },
        })
      );
    });

    it('should default dataSourceMDSId to empty string when undefined', async () => {
      mockHttp.post.mockResolvedValue({});

      await service.predictAnomalies(sampleParams, undefined);

      expect(mockHttp.post).toHaveBeenCalledWith(
        '/api/observability/ml-commons/rcf/predict',
        expect.objectContaining({
          query: { dataSourceMDSId: '' },
        })
      );
    });

    it('should throw error and call errorHandler on failure', async () => {
      const error = new Error('Network error');
      mockHttp.post.mockRejectedValue(error);
      const errorHandler = jest.fn();

      await expect(service.predictAnomalies(sampleParams, undefined, errorHandler)).rejects.toThrow(
        'Network error'
      );

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should throw error even without errorHandler', async () => {
      const error = new Error('Server error');
      mockHttp.post.mockRejectedValue(error);

      await expect(service.predictAnomalies(sampleParams)).rejects.toThrow('Server error');
    });

    it('should not call errorHandler when request succeeds', async () => {
      mockHttp.post.mockResolvedValue({ data: { anomalies: [] } });
      const errorHandler = jest.fn();

      await service.predictAnomalies(sampleParams, undefined, errorHandler);

      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should serialize full parameters in body', async () => {
      const fullParams = {
        data: [
          { timestamp: '2024-01-01', category: 'catA', value: 42 },
          { timestamp: '2024-01-02', category: 'catB', value: 99 },
        ],
        parameters: {
          number_of_trees: 200,
          shingle_size: 16,
          sample_size: 512,
          output_after: 64,
          time_decay: 0.001,
          anomaly_rate: 0.01,
          time_field: 'timestamp' as const,
          category_field: 'category',
          date_format: 'epoch_millis',
          time_zone: 'US/Pacific',
        },
      };

      mockHttp.post.mockResolvedValue({});

      await service.predictAnomalies(fullParams, 'mds-id');

      const calledBody = JSON.parse(mockHttp.post.mock.calls[0][1].body);
      expect(calledBody.data).toHaveLength(2);
      expect(calledBody.parameters.number_of_trees).toBe(200);
      expect(calledBody.parameters.category_field).toBe('category');
    });
  });
});
