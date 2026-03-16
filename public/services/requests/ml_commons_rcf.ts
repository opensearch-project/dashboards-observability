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

interface AnomalyResult {
  timestamp: string;
  category: string;
  score: number;
  grade: number;
  isAnomaly: boolean;
  actualValue: number;
}

interface RCFPredictResponse {
  anomalies: AnomalyResult[];
  metadata: Record<string, unknown>;
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
    errorHandler?: (error: unknown) => void
  ): Promise<RCFPredictResponse> => {
    try {
      return await this.http.post<RCFPredictResponse>('/api/observability/ml_commons_rcf/predict', {
        body: JSON.stringify(params),
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
