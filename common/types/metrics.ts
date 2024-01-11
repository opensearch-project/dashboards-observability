/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VisualizationType } from './custom_panels';
import { OTEL_METRIC_SUBTYPE } from '../constants/shared';
type AllMetricTypes = 'savedCustomMetric' | 'prometheusMetric' | typeof OTEL_METRIC_SUBTYPE;

export interface MetricType extends VisualizationType {
  id: string;
  savedVisualizationId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  query: {
    type: AllMetricTypes;
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
