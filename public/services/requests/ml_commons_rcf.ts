/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../../../src/core/public';

/**
 * Time Series Data Point Structure
 */
interface TimeSeriesDataPoint {
  timestamp: string;    // ISO 8601 timestamp
  category?: string;    // Pattern category
  value: number;        // Aggregated metric value
}

/**
 * ML Commons RCF Service
 * Provides client-side interface for anomaly detection operations
 */
export default class MLCommonsRCFService {
  private http: CoreStart['http'];

  constructor(http: CoreStart['http']) {
    this.http = http;
  }

  /**
   * Perform anomaly detection using ML Commons RCF algorithm
   * @param params RCF request parameters and data
   * @param dataSourceMDSId Optional multi-data source identifier
   * @param errorHandler Optional error handling callback
   * @returns Promise resolving to anomaly detection results
   */
  predictAnomalies = async (
    params: {
      data: TimeSeriesDataPoint[];
      parameters: {
        number_of_trees?: number;
        shingle_size?: number;
        sample_size?: number;
        output_after?: number;
        time_decay?: number;
        anomaly_rate?: number;
        time_field: string;
        category_field?: string;
        date_format?: string;
        time_zone?: string;
      };
    },
    dataSourceMDSId?: string,
    errorHandler?: (error: any) => void
  ) => {
    try {
      const response = await this.http.post('/api/observability/ml-commons/rcf/predict', {
        body: JSON.stringify(params),
        query: {
          dataSourceMDSId: dataSourceMDSId || '',
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return response;
    } catch (error) {
      console.error('ML Commons RCF client error:', error);
      
      // Call error handler if provided
      if (errorHandler) {
        errorHandler(error);
      }
      
      // Re-throw error for upstream handling
      throw error;
    }
  };
}