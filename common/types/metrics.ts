/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VisualizationType } from './custom_panels';
import { OBSERVABILITY_CUSTOM_METRIC } from '../constants/metrics';

export interface MetricData {
  metricId: string;
  metricType: 'savedCustomMetric' | 'prometheusMetric';
  metricName: string;
}

export interface MetricType extends VisualizationType {
  id: string;
  savedVisualizationId: string;
  query: string;
  x: number;
  y: number;
  w: number;
  h: number;
  catalog: string;
}
