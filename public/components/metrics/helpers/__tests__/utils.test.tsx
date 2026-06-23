/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mergeLayoutAndMetrics, sortMetricLayout } from '../utils';
import {
  sampleLayout,
  sampleMergedVisualizations,
  sampleMetricsVisualizations,
  sampleVisualizationsList,
} from '../../../../../test/metrics_constants';
import shuffle from 'lodash/shuffle';

describe('Utils helper functions', () => {
  it('validates sortMetricLayout function', () => {
    expect(sortMetricLayout(shuffle(sampleMetricsVisualizations))).toStrictEqual(
      sampleMetricsVisualizations
    );

    expect(sortMetricLayout(shuffle(sampleMetricsVisualizations))).toStrictEqual(
      sampleMetricsVisualizations
    );
  });

  it('validates mergeLayoutAndMetrics function', () => {
    expect(mergeLayoutAndMetrics(sampleLayout, sampleVisualizationsList)).toStrictEqual(
      sampleMergedVisualizations
    );
  });
});
