/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestHandlerContext, OpenSearchDashboardsRequest } from '../../../../../src/core/server';

/**
 * ML Commons RCF Facet
 * Handles anomaly detection operations using OpenSearch ML Commons RCF algorithm
 */
export class MLCommonsRCFFacet {
  constructor() {}

  /**
   * Perform anomaly detection using ML Commons RCF algorithm
   * @param context Request handler context
   * @param request HTTP request with RCF parameters and data
   * @returns Promise resolving to anomaly detection results
   */
  async predictAnomalies(context: RequestHandlerContext, request: OpenSearchDashboardsRequest) {
    try {
      const { data, parameters } = request.body as any;
      const dataSourceMDSId = (request.query as any).dataSourceMDSId;
      
      // Validate input data
      if (!data || data.length === 0) {
        return {
          success: true,
          data: {
            anomalies: [],
            metadata: {
              algorithm: 'RCF',
              message: 'No input data provided',
            },
          },
        };
      }

      // Build ML Commons RCF request with validated parameters
      const rcfRequest = {
        algorithm_name: "RCF",
        parameters: {
          // Core RCF parameters with defaults
          number_of_trees: parameters.number_of_trees || 100,
          shingle_size: parameters.shingle_size || 8,
          sample_size: parameters.sample_size || 256,
          output_after: parameters.output_after || 32,
          time_decay: parameters.time_decay || 0.0001,
          anomaly_rate: parameters.anomaly_rate || 0.005,
          
          // Field mapping configuration
          time_field: parameters.time_field || 'timestamp',
          category_field: parameters.category_field,
        },
        input_data: data,
      };

      // Call OpenSearch ML Commons API
      const rcfResponse = await this.callMLCommonsRCF(
        context, 
        rcfRequest, 
        dataSourceMDSId
      );

      // Transform response to standardized format
      const anomalies = this.transformRCFResponse(rcfResponse, data);

      return {
        success: true,
        data: {
          anomalies,
          metadata: {
            algorithm: 'RCF',
            model_id: rcfResponse.model_id,
            task_id: rcfResponse.task_id,
            parameters_used: rcfRequest.parameters,
            input_data_count: data.length,
            anomalies_detected: anomalies.length,
          },
        },
      };
    } catch (error) {
      console.error('ML Commons RCF error:', error);
      
      // Graceful error handling: return empty results instead of failing
      // This maintains consistency with original PPL AD command behavior
      return {
        success: true,
        data: {
          anomalies: [],
          metadata: {
            algorithm: 'RCF',
            error: error.message || 'ML Commons API call failed',
            error_type: error.name || 'UnknownError',
          },
        },
      };
    }
  }

  /**
   * Call OpenSearch ML Commons RCF API directly
   * Handles both single-data-source and multi-data-source scenarios
   */
  private async callMLCommonsRCF(
    context: RequestHandlerContext, 
    rcfRequest: any, 
    dataSourceMDSId?: string
  ) {
    let client;
    
    // Handle multi-data source scenarios
    if (dataSourceMDSId && (context as any).dataSource) {
      // Multi-data source scenario: get specific data source client
      client = await (context as any).dataSource.opensearch.getClient(dataSourceMDSId);
    } else {
      // Default data source scenario: use current user client
      client = context.core.opensearch.client.asCurrentUser;
    }

    // Direct ML Commons API call using transport.request
    // This approach is consistent with other plugins (query_enhancements, chat)
    const response = await client.transport.request({
      method: 'POST',
      path: '/_plugins/_ml/models/_train_predict',
      body: rcfRequest,
    });

    return response.body || response;
  }

  /**
   * Transform ML Commons RCF response to standardized anomaly format
   * Applies business logic for anomaly classification and scoring
   */
  private transformRCFResponse(rcfResponse: any, originalData: any[]): any[] {
    const anomalies: any[] = [];
    
    // Validate response structure
    if (!rcfResponse.inference_results || rcfResponse.inference_results.length === 0) {
      console.warn('No inference results in RCF response');
      return anomalies;
    }

    const results = rcfResponse.inference_results[0].output;
    
    if (!results || results.length === 0) {
      console.warn('No output results in RCF inference');
      return anomalies;
    }

    // Process each result and apply anomaly classification logic
    results.forEach((result: any, index: number) => {
      const dataAsMap = result.dataAsMap;
      const originalDataPoint = originalData[index];
      
      if (!dataAsMap || !originalDataPoint) {
        console.warn(`Missing data for result index ${index}`);
        return;
      }

      // Multi-criteria anomaly classification
      // Uses both anomaly_grade and anomaly_score for robust detection
      const anomalyScore = dataAsMap.anomaly_score || 0;
      const anomalyGrade = dataAsMap.anomaly_grade || 0;
      
      // Classification logic: anomaly if grade > 0 OR score > threshold
      const isAnomaly = anomalyGrade > 0 || anomalyScore > 0.5;
      
      if (isAnomaly) {
        anomalies.push({
          timestamp: originalDataPoint.timestamp,
          category: originalDataPoint.category || 'default',
          score: anomalyScore,
          grade: anomalyGrade,
          isAnomaly: true,
          actualValue: originalDataPoint.value,
          // Additional metadata for debugging and analysis
          confidence: Math.min(anomalyScore + anomalyGrade, 1.0),
          algorithm: 'RCF',
        });
      }
    });

    return anomalies;
  }
}