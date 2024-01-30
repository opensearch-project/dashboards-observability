/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VisualizationType } from './custom_panels';
type MetricTypes = 'savedCustomMetric' | 'prometheusMetric' | 'openTelemetryMetric';

export interface MetricType extends VisualizationType {
  id: string;
  savedVisualizationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  query: {
    type: MetricTypes;
    aggregation: string;
    attributesGroupBy: string[];
    catalog: string;
    availableAttributes?: string[];
  };
}

export interface OptionType {
  label: string;
  'data-test-subj': string;
}
