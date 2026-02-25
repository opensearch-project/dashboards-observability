/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestHandlerContext, OpenSearchDashboardsRequest } from '../../../../../src/core/server';

interface AnomalyResult {
  timestamp: string;
  category: string;
  score: number;
  grade: number;
  isAnomaly: true;
  actualValue: number;
}

interface RCFPredictionResult {
  success: boolean;
  data: {
    anomalies: AnomalyResult[];
    metadata: Record<string, unknown>;
  };
}

export class MLCommonsRCFFacet {
  constructor() {}

  async predictAnomalies(
    context: RequestHandlerContext,
    request: OpenSearchDashboardsRequest
  ): Promise<RCFPredictionResult> {
    try {
      const { data, parameters } = request.body as any;
      const dataSourceMDSId = (request.query as any).dataSourceMDSId;

      if (!data || data.length === 0) {
        return {
          success: true,
          data: {
            anomalies: [],
            metadata: { algorithm: 'RCF', message: 'No input data provided' },
          },
        };
      }

      const rcfRequest = {
        parameters: {
          number_of_trees: parameters.number_of_trees,
          shingle_size: parameters.shingle_size,
          sample_size: parameters.sample_size,
          output_after: parameters.output_after,
          time_decay: parameters.time_decay,
          anomaly_rate: parameters.anomaly_rate,
          time_field: parameters.time_field,
          category_field: parameters.category_field,
          date_format: parameters.date_format,
          time_zone: parameters.time_zone,
        },
        input_data: data,
      };

      const rcfResponse = await this.callMLCommonsRCF(context, rcfRequest, dataSourceMDSId);
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
      console.error('ML Commons RCF predictAnomalies error:', error.message);
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

  private async callMLCommonsRCF(
    context: RequestHandlerContext,
    rcfRequest: any,
    dataSourceMDSId?: string
  ) {
    let client;

    if (dataSourceMDSId && (context as any).dataSource) {
      client = await (context as any).dataSource.opensearch.getClient(dataSourceMDSId);
    } else {
      client = context.core.opensearch.client.asCurrentUser;
    }

    const { input_data: inputData, parameters } = rcfRequest;
    const categoryField = parameters.category_field;

    const categorizedData = this.groupDataByCategory(inputData, categoryField);
    const allResults: any[] = [];

    for (const [category, categoryData] of Object.entries(categorizedData)) {
      try {
        const dataFrame = this.convertToDataFrame(categoryData as any[], categoryField);

        const categoryRcfRequest = {
          parameters,
          input_data: dataFrame,
        };

        const response = await client.transport.request({
          method: 'POST',
          path: '/_plugins/_ml/_train_predict/FIT_RCF',
          body: categoryRcfRequest,
        });

        const result = response.body || response;

        allResults.push({
          ...result,
          originalData: categoryData,
          category,
        });
      } catch (categoryError) {
        console.error(`ML Commons RCF error for category ${category}:`, categoryError.message);
      }
    }

    return this.mergeRCFResults(allResults);
  }

  private groupDataByCategory(inputData: any[], categoryField?: string): Record<string, any[]> {
    if (!categoryField) {
      return { default: inputData };
    }

    const grouped: Record<string, any[]> = {};
    inputData.forEach((item) => {
      const category = item[categoryField] || 'default';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    });

    return grouped;
  }

  private convertToDataFrame(data: any[], categoryField?: string): any {
    if (!data || data.length === 0) {
      return { column_metas: [], rows: [] };
    }

    const sampleItem = data[0];
    const fieldNames = Object.keys(sampleItem).filter((key) => key !== categoryField);

    const columnMetas = fieldNames.map((fieldName) => {
      const sampleValue = sampleItem[fieldName];
      let columnType = 'STRING';

      if (typeof sampleValue === 'number') {
        columnType = Number.isInteger(sampleValue) ? 'INTEGER' : 'DOUBLE';
      }

      return { name: fieldName, column_type: columnType };
    });

    const rows = data.map((item) => ({
      values: fieldNames.map((fieldName) => {
        const value = item[fieldName];
        let columnType = 'STRING';

        if (typeof value === 'number') {
          columnType = Number.isInteger(value) ? 'INTEGER' : 'DOUBLE';
        }

        return { column_type: columnType, value };
      }),
    }));

    return { column_metas: columnMetas, rows };
  }

  private mergeRCFResults(results: any[]): any {
    if (results.length === 0) {
      return { prediction_result: { column_metas: [], rows: [] } };
    }

    if (results.length === 1) {
      return results[0];
    }

    return {
      results: results.map((result) => ({
        prediction_result: result.prediction_result,
        originalData: result.originalData,
        category: result.category,
      })),
    };
  }

  private transformRCFResponse(rcfResponse: any, originalData: any[]): AnomalyResult[] {
    if (rcfResponse.prediction_result) {
      return this.processRCFPredictionResult(rcfResponse.prediction_result, originalData);
    }

    if (rcfResponse.results && Array.isArray(rcfResponse.results)) {
      const anomalies: AnomalyResult[] = [];
      rcfResponse.results.forEach((categoryResult: any) => {
        if (categoryResult.prediction_result && categoryResult.originalData) {
          anomalies.push(
            ...this.processRCFPredictionResult(
              categoryResult.prediction_result,
              categoryResult.originalData
            )
          );
        }
      });
      return anomalies;
    }

    return [];
  }

  private processRCFPredictionResult(predictionResult: any, inputData: any[]): AnomalyResult[] {
    const anomalies: AnomalyResult[] = [];

    if (!predictionResult.column_metas || !predictionResult.rows) {
      return anomalies;
    }

    const outputColumnMap = new Map<string, number>();
    predictionResult.column_metas.forEach((meta: any, index: number) => {
      outputColumnMap.set(meta.name, index);
    });

    predictionResult.rows.forEach((outputRow: any, index: number) => {
      if (index >= inputData.length) {
        return;
      }

      const originalDataPoint = inputData[index];
      const outputValues = outputRow.values;

      const scoreIndex = outputColumnMap.get('score');
      const anomalyGradeIndex = outputColumnMap.get('anomaly_grade');

      const anomalyScore = scoreIndex !== undefined ? outputValues[scoreIndex]?.value || 0 : 0;
      const anomalyGrade =
        anomalyGradeIndex !== undefined ? outputValues[anomalyGradeIndex]?.value || 0 : 0;

      if (anomalyGrade > 0 || anomalyScore > 0) {
        anomalies.push({
          timestamp: originalDataPoint.timestamp,
          category: originalDataPoint.category || 'default',
          score: anomalyScore,
          grade: anomalyGrade,
          isAnomaly: true,
          actualValue: originalDataPoint.value,
        });
      }
    });

    return anomalies;
  }
}
