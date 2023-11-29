/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VisualizationType } from './custom_panels';

<<<<<<< HEAD
=======
export interface MetricData {
  metricId: string;
  metricType: 'savedCustomMetric' | 'prometheusMetric' | 'openTelemetryMetric';
  metricName: string;
}

>>>>>>> 62e43d7a (Upgraded)
export interface MetricType extends VisualizationType {
  id: string;
  savedVisualizationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
<<<<<<< HEAD
  query: {
    type: 'savedCustomMetric' | 'prometheusMetric';
    aggregation: string;
    attributesGroupBy: string[];
    catalog: string;
    availableAttributes?: string[];
  };
=======
  metricType: 'savedCustomMetric' | 'prometheusMetric' | 'openTelemetryMetric';
>>>>>>> 62e43d7a (Upgraded)
}
