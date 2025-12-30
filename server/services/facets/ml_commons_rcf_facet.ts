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
          // Required parameters for ML Commons RCF API
          date_format: parameters.date_format || 'yyyy-MM-dd HH:mm:ss',
          time_zone: parameters.time_zone || 'UTC',
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
      // Use original input data for proper merging
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
   * Call OpenSearch ML Commons RCF API directly with category bucketing
   * Handles both single-data-source and multi-data-source scenarios
   * Implements category-based bucketing as per ML Commons requirements
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

    const { input_data, parameters } = rcfRequest;
    const categoryField = parameters.category_field;
    
    // Group data by category if category field is specified
    const categorizedData = this.groupDataByCategory(input_data, categoryField);
    const allResults: any[] = [];
    const allOriginalData: any[] = []; // Keep track of original data order
    
    // Process each category separately (as per ML Commons RCF requirements)
    for (const [category, categoryData] of Object.entries(categorizedData)) {
      try {
        // Convert to DataFrame format required by ML Commons
        const dataFrame = this.convertToDataFrame(categoryData as any[], categoryField);
        
        const categoryRcfRequest = {
          parameters: {
            ...parameters,
            // Add required parameters for ML Commons RCF
            date_format: parameters.date_format || 'yyyy-MM-dd HH:mm:ss',
            time_zone: parameters.time_zone || 'UTC',
          },
          input_data: dataFrame,
        };

        // Call ML Commons RCF API with correct endpoint
        const response = await client.transport.request({
          method: 'POST',
          path: '/_plugins/_ml/_train_predict/FIT_RCF',
          body: categoryRcfRequest,
        });

        const result = response.body || response;
        
        // Store results with original data for proper merging
        allResults.push({
          ...result,
          originalData: categoryData, // Keep original data for merging
          category: category
        });
        
        // Keep track of all original data in order
        allOriginalData.push(...(categoryData as any[]));
      } catch (categoryError) {
        console.error(`ML Commons RCF error for category ${category}:`, categoryError);
        // Continue processing other categories even if one fails
      }
    }

    // Merge results from all categories with proper data alignment
    return this.mergeRCFResults(allResults, allOriginalData);
  }

  /**
   * Group input data by category field
   */
  private groupDataByCategory(inputData: any[], categoryField?: string): Record<string, any[]> {
    if (!categoryField) {
      return { default: inputData };
    }

    const grouped: Record<string, any[]> = {};
    inputData.forEach(item => {
      const category = item[categoryField] || 'default';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    });

    return grouped;
  }

  /**
   * Convert data to DataFrame format required by ML Commons RCF API
   */
  private convertToDataFrame(data: any[], categoryField?: string): any {
    if (!data || data.length === 0) {
      return {
        column_metas: [],
        rows: []
      };
    }

    // Get all unique field names from the data, excluding category field for ML input
    const sampleItem = data[0];
    const fieldNames = Object.keys(sampleItem).filter(key => key !== categoryField);
    
    // Create column metadata
    const column_metas = fieldNames.map(fieldName => {
      const sampleValue = sampleItem[fieldName];
      let columnType = 'STRING';
      
      if (typeof sampleValue === 'number') {
        columnType = Number.isInteger(sampleValue) ? 'INTEGER' : 'DOUBLE';
      } else if (fieldName === 'timestamp' || fieldName.includes('time')) {
        columnType = 'STRING'; // Timestamps are sent as formatted strings
      }
      
      return {
        name: fieldName,
        column_type: columnType
      };
    });

    // Convert data rows to DataFrame format
    const rows = data.map(item => ({
      values: fieldNames.map(fieldName => {
        const value = item[fieldName];
        let columnType = 'STRING';
        
        if (typeof value === 'number') {
          columnType = Number.isInteger(value) ? 'INTEGER' : 'DOUBLE';
        }
        
        return {
          column_type: columnType,
          value: value
        };
      })
    }));

    return {
      column_metas,
      rows
    };
  }

  /**
   * Merge results from multiple category-based RCF calls
   * Handles prediction_result format from ML Commons RCF API
   * Maintains proper alignment between input and output data
   */
  private mergeRCFResults(results: any[], allOriginalData: any[]): any {
    if (results.length === 0) {
      return {
        prediction_result: {
          column_metas: [],
          rows: []
        }
      };
    }

    if (results.length === 1) {
      // Single category - return the result directly
      return results[0];
    }

    // Multiple categories - return in a format that transformRCFResponse can handle
    return {
      results: results.map(result => ({
        prediction_result: result.prediction_result,
        originalData: result.originalData,
        category: result.category
      }))
    };
  }

  /**
   * Transform ML Commons RCF response to standardized anomaly format
   * Handles DataFrame response format from ML Commons RCF API
   * Merges input and output DataFrames as per PPL AD command logic
   */
  private transformRCFResponse(rcfResponse: any, originalData: any[]): any[] {
    const anomalies: any[] = [];
    
    console.log('transformRCFResponse input rcfResponse:', JSON.stringify(rcfResponse, null, 2));
    console.log('transformRCFResponse input originalData:', originalData);
    
    // Handle single category response
    if (rcfResponse.prediction_result) {
      console.log('Processing single category response');
      return this.processRCFPredictionResult(rcfResponse.prediction_result, originalData);
    }
    
    // Handle merged multi-category response
    if (rcfResponse.results && Array.isArray(rcfResponse.results)) {
      console.log('Processing multi-category response with', rcfResponse.results.length, 'categories');
      let dataOffset = 0;
      rcfResponse.results.forEach((categoryResult: any, index: number) => {
        console.log(`Processing category ${index}:`, categoryResult.category);
        if (categoryResult.prediction_result && categoryResult.originalData) {
          const categoryAnomalies = this.processRCFPredictionResult(
            categoryResult.prediction_result, 
            categoryResult.originalData
          );
          console.log(`Category ${index} produced ${categoryAnomalies.length} anomalies`);
          anomalies.push(...categoryAnomalies);
          dataOffset += categoryResult.originalData.length;
        }
      });
      console.log(`Total anomalies from all categories: ${anomalies.length}`);
      return anomalies;
    }
    
    console.warn('Unexpected RCF response format:', rcfResponse);
    return anomalies;
  }

  /**
   * Process a single RCF prediction result and merge with input data
   */
  private processRCFPredictionResult(predictionResult: any, inputData: any[]): any[] {
    const anomalies: any[] = [];
    
    console.log('processRCFPredictionResult input data length:', inputData.length);
    console.log('processRCFPredictionResult prediction rows:', predictionResult.rows?.length);
    console.log('processRCFPredictionResult input data:', inputData);
    
    if (!predictionResult.column_metas || !predictionResult.rows) {
      console.warn('Invalid prediction_result structure in RCF response');
      return anomalies;
    }

    // Create column name mapping for output columns
    const outputColumnMap = new Map<string, number>();
    predictionResult.column_metas.forEach((meta: any, index: number) => {
      outputColumnMap.set(meta.name, index);
      console.log(`Column ${index}: ${meta.name} (${meta.column_type})`);
    });

    // Process each output row and merge with corresponding input data
    predictionResult.rows.forEach((outputRow: any, index: number) => {
      if (index >= inputData.length) {
        console.warn(`Output row ${index} has no corresponding input data`);
        return;
      }

      const originalDataPoint = inputData[index];
      const outputValues = outputRow.values;

      console.log(`Processing row ${index}:`, {
        originalData: originalDataPoint,
        outputValues: outputValues.map((v: any) => v.value)
      });

      // Extract anomaly detection values from output
      const scoreIndex = outputColumnMap.get('score');
      const anomalyGradeIndex = outputColumnMap.get('anomaly_grade');
      const timestampIndex = outputColumnMap.get('timestamp');

      const anomalyScore = scoreIndex !== undefined ? (outputValues[scoreIndex]?.value || 0) : 0;
      const anomalyGrade = anomalyGradeIndex !== undefined ? (outputValues[anomalyGradeIndex]?.value || 0) : 0;
      
      console.log(`Row ${index} scores:`, { anomalyScore, anomalyGrade });
      
      // Convert timestamp from LONG to string if present in output
      let outputTimestamp = originalDataPoint.timestamp;
      if (timestampIndex !== undefined && outputValues[timestampIndex]?.value) {
        const timestampValue = outputValues[timestampIndex].value;
        // Convert from milliseconds to ISO string if it's a number
        if (typeof timestampValue === 'number') {
          outputTimestamp = new Date(timestampValue).toISOString();
        }
      }

      // Create merged result following PPL AD logic
      // Input columns + output columns (with conflict resolution)
      const mergedResult: { [key: string]: any } = {
        // Original input data
        timestamp: originalDataPoint.timestamp,
        category: originalDataPoint.category || 'default',
        value: originalDataPoint.value,
        
        // Output data with conflict resolution (add "1" suffix for conflicts)
        score: anomalyScore,
        anomaly_grade: anomalyGrade,
      };

      // Handle timestamp conflict resolution
      if (outputTimestamp !== originalDataPoint.timestamp) {
        mergedResult.timestamp1 = outputTimestamp;
      }

      // Multi-criteria anomaly classification
      // For debugging: return all data points, not just anomalies
      // This allows us to see what ML Commons is returning
      const isAnomaly = anomalyGrade > 0 || anomalyScore > 0;
            
      // Always add the data point for debugging purposes
      const anomalyData = {
        timestamp: originalDataPoint.timestamp,
        category: originalDataPoint.category || 'default',
        score: anomalyScore,
        grade: anomalyGrade,
        isAnomaly: isAnomaly,
        actualValue: originalDataPoint.value,
        // Additional metadata for debugging and analysis
        confidence: Math.min(anomalyScore + anomalyGrade, 1.0),
        algorithm: 'RCF',
        // Include merged result for debugging
        mergedData: mergedResult,
      };
      
      anomalies.push(anomalyData);
    });

    return anomalies;
  }
}