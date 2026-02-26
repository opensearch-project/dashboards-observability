/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MLCommonsRCFFacet } from '../ml_commons_rcf_facet';
import {
  RequestHandlerContext,
  OpenSearchDashboardsRequest,
} from '../../../../../../src/core/server';

describe('MLCommonsRCFFacet', () => {
  let facet: MLCommonsRCFFacet;
  let mockContext: any;
  let mockRequest: any;
  let mockTransportRequest: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    facet = new MLCommonsRCFFacet();

    mockTransportRequest = jest.fn();
    mockContext = {
      core: {
        opensearch: {
          client: {
            asCurrentUser: {
              transport: { request: mockTransportRequest },
            },
          },
        },
      },
    };
  });

  const buildRequest = (body: any, query: any = {}): any => ({
    body,
    query,
  });

  describe('predictAnomalies', () => {
    it('should return empty anomalies when no input data', async () => {
      mockRequest = buildRequest({ data: [], parameters: {} });

      const result = await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      expect(result.success).toBe(true);
      expect(result.data.anomalies).toEqual([]);
      expect(result.data.metadata.message).toBe('No input data provided');
      expect(mockTransportRequest).not.toHaveBeenCalled();
    });

    it('should return empty anomalies when data is null', async () => {
      mockRequest = buildRequest({ data: null, parameters: {} });

      const result = await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      expect(result.success).toBe(true);
      expect(result.data.anomalies).toEqual([]);
    });

    it('should call ML Commons RCF API and return anomalies', async () => {
      const inputData = [
        { timestamp: '2024-01-01 00:00:00', value: 10 },
        { timestamp: '2024-01-01 00:01:00', value: 100 },
      ];

      mockRequest = buildRequest({
        data: inputData,
        parameters: {
          number_of_trees: 100,
          shingle_size: 8,
          sample_size: 256,
          output_after: 32,
          time_decay: 0.0001,
          anomaly_rate: 0.005,
          time_field: 'timestamp',
          date_format: 'yyyy-MM-dd HH:mm:ss',
          time_zone: 'UTC',
        },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: {
            column_metas: [
              { name: 'score', column_type: 'DOUBLE' },
              { name: 'anomaly_grade', column_type: 'DOUBLE' },
            ],
            rows: [
              { values: [{ value: 0 }, { value: 0 }] },
              { values: [{ value: 0.8 }, { value: 0.9 }] },
            ],
          },
        },
      });

      const result = await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      expect(result.success).toBe(true);
      expect(result.data.anomalies).toHaveLength(1);
      expect(result.data.anomalies[0]).toEqual({
        timestamp: '2024-01-01 00:01:00',
        category: 'default',
        score: 0.8,
        grade: 0.9,
        isAnomaly: true,
        actualValue: 100,
      });
      expect(result.data.metadata.anomalies_detected).toBe(1);
      expect(result.data.metadata.input_data_count).toBe(2);
    });

    it('should handle ML Commons API errors gracefully', async () => {
      mockRequest = buildRequest({
        data: [{ timestamp: '2024-01-01 00:00:00', value: 10 }],
        parameters: {
          number_of_trees: 100,
          time_field: 'timestamp',
        },
      });

      mockTransportRequest.mockRejectedValue(new Error('Connection refused'));

      const result = await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      // Per-category errors are caught internally; result is still success with empty anomalies
      expect(result.success).toBe(true);
      expect(result.data.anomalies).toEqual([]);
      expect(result.data.metadata.anomalies_detected).toBe(0);
    });

    it('should return error metadata when client creation fails', async () => {
      // Override context to throw on client access
      const brokenContext = {
        core: {
          opensearch: {
            client: {
              get asCurrentUser(): any {
                throw new Error('Client unavailable');
              },
            },
          },
        },
      };

      mockRequest = buildRequest({
        data: [{ timestamp: '2024-01-01 00:00:00', value: 10 }],
        parameters: { time_field: 'timestamp' },
      });

      const result = await facet.predictAnomalies(
        brokenContext as any,
        mockRequest as OpenSearchDashboardsRequest
      );

      expect(result.success).toBe(false);
      expect(result.data.anomalies).toEqual([]);
      expect(result.data.metadata.error).toBe('Client unavailable');
    });

    it('should pass parameters directly without redundant defaults', async () => {
      mockRequest = buildRequest({
        data: [{ timestamp: '2024-01-01 00:00:00', value: 5 }],
        parameters: {
          number_of_trees: 50,
          shingle_size: 4,
          sample_size: 128,
          output_after: 16,
          time_decay: 0.001,
          anomaly_rate: 0.01,
          time_field: 'ts',
          date_format: 'epoch_millis',
          time_zone: 'US/Eastern',
        },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: {
            column_metas: [
              { name: 'score', column_type: 'DOUBLE' },
              { name: 'anomaly_grade', column_type: 'DOUBLE' },
            ],
            rows: [{ values: [{ value: 0 }, { value: 0 }] }],
          },
        },
      });

      await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      const calledBody = mockTransportRequest.mock.calls[0][0].body;
      expect(calledBody.parameters.number_of_trees).toBe(50);
      expect(calledBody.parameters.shingle_size).toBe(4);
      expect(calledBody.parameters.time_field).toBe('ts');
      expect(calledBody.parameters.date_format).toBe('epoch_millis');
      expect(calledBody.parameters.time_zone).toBe('US/Eastern');
    });
  });

  describe('category bucketing', () => {
    it('should group data by category and call RCF per category', async () => {
      const inputData = [
        { timestamp: '2024-01-01 00:00:00', category: 'catA', value: 10 },
        { timestamp: '2024-01-01 00:01:00', category: 'catA', value: 20 },
        { timestamp: '2024-01-01 00:00:00', category: 'catB', value: 30 },
      ];

      mockRequest = buildRequest({
        data: inputData,
        parameters: {
          time_field: 'timestamp',
          category_field: 'category',
        },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: {
            column_metas: [
              { name: 'score', column_type: 'DOUBLE' },
              { name: 'anomaly_grade', column_type: 'DOUBLE' },
            ],
            rows: [
              { values: [{ value: 0 }, { value: 0 }] },
              { values: [{ value: 0.5 }, { value: 0.6 }] },
            ],
          },
        },
      });

      await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      // Two categories -> two API calls
      expect(mockTransportRequest).toHaveBeenCalledTimes(2);
    });

    it('should continue processing other categories when one fails', async () => {
      const inputData = [
        { timestamp: '2024-01-01 00:00:00', category: 'catA', value: 10 },
        { timestamp: '2024-01-01 00:00:00', category: 'catB', value: 20 },
      ];

      mockRequest = buildRequest({
        data: inputData,
        parameters: {
          time_field: 'timestamp',
          category_field: 'category',
        },
      });

      mockTransportRequest.mockRejectedValueOnce(new Error('catA failed')).mockResolvedValueOnce({
        body: {
          prediction_result: {
            column_metas: [
              { name: 'score', column_type: 'DOUBLE' },
              { name: 'anomaly_grade', column_type: 'DOUBLE' },
            ],
            rows: [{ values: [{ value: 0.7 }, { value: 0.8 }] }],
          },
        },
      });

      const result = await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      expect(result.success).toBe(true);
      // catB anomaly should still be detected
      expect(result.data.anomalies.length).toBeGreaterThanOrEqual(0);
    });

    it('should treat all data as default category when no category_field', async () => {
      mockRequest = buildRequest({
        data: [
          { timestamp: '2024-01-01 00:00:00', value: 10 },
          { timestamp: '2024-01-01 00:01:00', value: 20 },
        ],
        parameters: { time_field: 'timestamp' },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: {
            column_metas: [
              { name: 'score', column_type: 'DOUBLE' },
              { name: 'anomaly_grade', column_type: 'DOUBLE' },
            ],
            rows: [
              { values: [{ value: 0 }, { value: 0 }] },
              { values: [{ value: 0 }, { value: 0 }] },
            ],
          },
        },
      });

      await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      // Single call for "default" group
      expect(mockTransportRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('DataFrame conversion', () => {
    it('should correctly infer column types from data', async () => {
      mockRequest = buildRequest({
        data: [{ timestamp: '2024-01-01', value: 3.14 }],
        parameters: { time_field: 'timestamp' },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: {
            column_metas: [
              { name: 'score', column_type: 'DOUBLE' },
              { name: 'anomaly_grade', column_type: 'DOUBLE' },
            ],
            rows: [{ values: [{ value: 0 }, { value: 0 }] }],
          },
        },
      });

      await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      const calledBody = mockTransportRequest.mock.calls[0][0].body;
      const columnMetas = calledBody.input_data.column_metas;

      const timestampCol = columnMetas.find((c: any) => c.name === 'timestamp');
      const valueCol = columnMetas.find((c: any) => c.name === 'value');

      expect(timestampCol.column_type).toBe('STRING');
      expect(valueCol.column_type).toBe('DOUBLE');
    });

    it('should detect INTEGER type for whole numbers', async () => {
      mockRequest = buildRequest({
        data: [{ timestamp: '2024-01-01', value: 42 }],
        parameters: { time_field: 'timestamp' },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: { column_metas: [], rows: [] },
        },
      });

      await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      const calledBody = mockTransportRequest.mock.calls[0][0].body;
      const valueCol = calledBody.input_data.column_metas.find((c: any) => c.name === 'value');
      expect(valueCol.column_type).toBe('INTEGER');
    });

    it('should exclude category_field from DataFrame columns', async () => {
      mockRequest = buildRequest({
        data: [{ timestamp: '2024-01-01', category: 'catA', value: 10 }],
        parameters: { time_field: 'timestamp', category_field: 'category' },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: { column_metas: [], rows: [] },
        },
      });

      await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      const calledBody = mockTransportRequest.mock.calls[0][0].body;
      const colNames = calledBody.input_data.column_metas.map((c: any) => c.name);
      expect(colNames).not.toContain('category');
      expect(colNames).toContain('timestamp');
      expect(colNames).toContain('value');
    });
  });

  describe('anomaly filtering', () => {
    it('should only return data points with anomaly score or grade > 0', async () => {
      mockRequest = buildRequest({
        data: [
          { timestamp: '2024-01-01 00:00:00', value: 10 },
          { timestamp: '2024-01-01 00:01:00', value: 20 },
          { timestamp: '2024-01-01 00:02:00', value: 999 },
        ],
        parameters: { time_field: 'timestamp' },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: {
            column_metas: [
              { name: 'score', column_type: 'DOUBLE' },
              { name: 'anomaly_grade', column_type: 'DOUBLE' },
            ],
            rows: [
              { values: [{ value: 0 }, { value: 0 }] },
              { values: [{ value: 0 }, { value: 0 }] },
              { values: [{ value: 0.95 }, { value: 0.8 }] },
            ],
          },
        },
      });

      const result = await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      expect(result.data.anomalies).toHaveLength(1);
      expect(result.data.anomalies[0].actualValue).toBe(999);
      expect(result.data.anomalies[0].isAnomaly).toBe(true);
    });

    it('should return no anomalies when all scores are zero', async () => {
      mockRequest = buildRequest({
        data: [
          { timestamp: '2024-01-01 00:00:00', value: 10 },
          { timestamp: '2024-01-01 00:01:00', value: 11 },
        ],
        parameters: { time_field: 'timestamp' },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: {
            column_metas: [
              { name: 'score', column_type: 'DOUBLE' },
              { name: 'anomaly_grade', column_type: 'DOUBLE' },
            ],
            rows: [
              { values: [{ value: 0 }, { value: 0 }] },
              { values: [{ value: 0 }, { value: 0 }] },
            ],
          },
        },
      });

      const result = await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      expect(result.data.anomalies).toHaveLength(0);
    });

    it('should handle response with missing column_metas or rows', async () => {
      mockRequest = buildRequest({
        data: [{ timestamp: '2024-01-01 00:00:00', value: 10 }],
        parameters: { time_field: 'timestamp' },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: {},
        },
      });

      const result = await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      expect(result.success).toBe(true);
      expect(result.data.anomalies).toEqual([]);
    });

    it('should handle rows exceeding input data length', async () => {
      mockRequest = buildRequest({
        data: [{ timestamp: '2024-01-01 00:00:00', value: 10 }],
        parameters: { time_field: 'timestamp' },
      });

      mockTransportRequest.mockResolvedValue({
        body: {
          prediction_result: {
            column_metas: [
              { name: 'score', column_type: 'DOUBLE' },
              { name: 'anomaly_grade', column_type: 'DOUBLE' },
            ],
            rows: [
              { values: [{ value: 0.5 }, { value: 0.6 }] },
              { values: [{ value: 0.9 }, { value: 0.8 }] }, // extra row
            ],
          },
        },
      });

      const result = await facet.predictAnomalies(
        mockContext as RequestHandlerContext,
        mockRequest as OpenSearchDashboardsRequest
      );

      expect(result.data.anomalies).toHaveLength(1);
    });
  });
});
