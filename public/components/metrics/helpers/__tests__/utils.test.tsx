/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { mergeLayoutAndMetrics, sortMetricLayout } from '../utils';
import {
  sampleLayout,
  sampleMergedVisualizations,
  sampleMetricsVisualizations,
  sampleVisualizationsList,
} from '../../../../../test/metrics_constants';
import _ from 'lodash';

describe('Utils helper functions', () => {
  configure({ adapter: new Adapter() });

  it('validates sortMetricLayout function', () => {
    expect(sortMetricLayout(_.shuffle(sampleMetricsVisualizations))).toStrictEqual(
      sampleMetricsVisualizations
    );

    expect(sortMetricLayout(_.shuffle(sampleMetricsVisualizations))).toStrictEqual(
      sampleMetricsVisualizations
    );
  });

  it('validates mergeLayoutAndMetrics function', () => {
    expect(mergeLayoutAndMetrics(sampleLayout, sampleVisualizationsList)).toStrictEqual(
      sampleMergedVisualizations
    );
  });
});
