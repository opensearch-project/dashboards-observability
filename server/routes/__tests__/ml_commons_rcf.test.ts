/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { registerMLCommonsRCFRoute } from '../ml_commons_rcf';
import { MLCommonsRCFFacet } from '../../services/facets/ml_commons_rcf_facet';

describe('registerMLCommonsRCFRoute', () => {
  let mockRouter: any;
  let mockFacet: jest.Mocked<MLCommonsRCFFacet>;
  let routeHandler: any;
  let mockResponse: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRouter = {
      post: jest.fn(),
    };

    mockFacet = {
      predictAnomalies: jest.fn(),
    } as any;

    registerMLCommonsRCFRoute({ router: mockRouter, facet: mockFacet });

    const [_routeConfig, handler] = mockRouter.post.mock.calls[0];
    routeHandler = handler;

    mockResponse = {
      ok: jest.fn((data) => data),
      custom: jest.fn((data) => data),
    };
  });

  it('should register POST route at correct path', () => {
    expect(mockRouter.post).toHaveBeenCalledTimes(1);
    const [routeConfig] = mockRouter.post.mock.calls[0];
    expect(routeConfig.path).toBe('/api/observability/ml_commons_rcf/predict');
  });

  it('should have body and query validation schema', () => {
    const [routeConfig] = mockRouter.post.mock.calls[0];
    expect(routeConfig.validate).toBeDefined();
    expect(routeConfig.validate.body).toBeDefined();
    expect(routeConfig.validate.query).toBeDefined();
  });

  it('should return ok response on successful prediction', async () => {
    const mockResult = {
      success: true,
      data: {
        anomalies: [{ timestamp: '2024-01-01', score: 0.9, isAnomaly: true }],
        metadata: { algorithm: 'RCF' },
      },
    };

    mockFacet.predictAnomalies.mockResolvedValue(mockResult);

    const mockContext = {} as any;
    const mockRequest = { body: {}, query: {} } as any;

    await routeHandler(mockContext, mockRequest, mockResponse);

    expect(mockFacet.predictAnomalies).toHaveBeenCalledWith(mockContext, mockRequest);
    expect(mockResponse.ok).toHaveBeenCalledWith({
      body: mockResult.data,
      headers: { 'content-type': 'application/json' },
    });
  });

  it('should return 400 when facet returns success: false', async () => {
    const mockResult = {
      success: false,
      data: {
        anomalies: [],
        metadata: { error: 'Model not found' },
      },
    };

    mockFacet.predictAnomalies.mockResolvedValue(mockResult);

    await routeHandler({} as any, {} as any, mockResponse);

    expect(mockResponse.custom).toHaveBeenCalledWith({
      statusCode: 400,
      body: {
        error: 'RCF anomaly detection failed',
        details: 'Model not found',
      },
    });
  });

  it('should return 400 with default message when no error detail', async () => {
    const mockResult = {
      success: false,
      data: { anomalies: [], metadata: {} },
    };

    mockFacet.predictAnomalies.mockResolvedValue(mockResult);

    await routeHandler({} as any, {} as any, mockResponse);

    expect(mockResponse.custom).toHaveBeenCalledWith({
      statusCode: 400,
      body: {
        error: 'RCF anomaly detection failed',
        details: 'Unknown error occurred',
      },
    });
  });

  it('should return 500 when facet throws unexpected error', async () => {
    mockFacet.predictAnomalies.mockRejectedValue(new Error('Unexpected crash'));

    await routeHandler({} as any, {} as any, mockResponse);

    expect(mockResponse.custom).toHaveBeenCalledWith({
      statusCode: 500,
      body: {
        error: 'Internal server error',
        message: 'Unexpected crash',
      },
    });
  });
});
