/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VisualizationType } from './custom_panels';

// export interface MetricData {
//   metricId: string;
//   metricType: 'savedCustomMetric' | 'prometheusMetric' | 'openTelemetryMetric';
//   metricName: string;
// }

export interface MetricType extends VisualizationType {
  id: string;
  savedVisualizationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  query: {
    type: 'savedCustomMetric' | 'prometheusMetric' | 'openTelemetryMetric';
    aggregation: string;
    attributesGroupBy: string[];
    catalog: string;
    availableAttributes?: string[];
  };
  // metricType: 'savedCustomMetric' | 'prometheusMetric' | 'openTelemetryMetric';
}

export interface OptionType {
  label: string;
  'data-test-subj': string;
}
// selectedDataSource: React.SetStateAction<Array<{ label: string; 'data-test-subj': string }>>;
//   setSelectedDataSource: React.Dispatch<React.SetStateAction<unknown>>;
