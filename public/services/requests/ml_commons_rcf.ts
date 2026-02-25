/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../../../src/core/public';

interface TimeSeriesDataPoint {
  timestamp: string;
  category?: string;
  value: number;
}

export class MLCommonsRCFService {
  private http: CoreStart['http'];

  constructor(http: CoreStart['http']) {
    this.http = http;
  }

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
      return await this.http.post('/api/observability/ml-commons/rcf/predict', {
        body: JSON.stringify(params),
        query: { dataSourceMDSId: dataSourceMDSId || '' },
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('ML Commons RCF client error:', error);
      if (errorHandler) {
        errorHandler(error);
      }
      throw error;
    }
  };
}
