/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VisualizationType } from './custom_panels';

export interface MetricType extends VisualizationType {
  id: string;
  savedVisualizationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  query: {
    type: 'savedCustomMetric' | 'prometheusMetric';
    aggregation: string;
    attributesGroupBy: string[];
    catalog: string;
    availableAttributes?: string[];
  };
}
