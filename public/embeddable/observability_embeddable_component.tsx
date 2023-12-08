/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  SavedObjectEmbeddableInput,
  withEmbeddableSubscription,
} from '../../../../src/plugins/embeddable/public';
import { SavedObjectVisualization } from '../components/visualizations/saved_object_visualization';
import { parseFilters } from './filters/filter_parser';
import { ObservabilityEmbeddable, ObservabilityOutput } from './observability_embeddable';

interface ObservabilityEmbeddableComponentProps {
  input: SavedObjectEmbeddableInput;
  output: ObservabilityOutput;
  embeddable: ObservabilityEmbeddable;
}

const ObservabilityEmbeddableComponentInner: React.FC<ObservabilityEmbeddableComponentProps> = (
  props
) => {
  const visualization = props.output.attributes?.savedVisualization;
  return visualization ? (
    <SavedObjectVisualization
      savedVisualization={visualization}
      timeRange={props.input.timeRange}
      filters={props.input.filters}
      query={props.input.query}
      whereClause={parseFilters(props.input.filters)}
    />
  ) : null;
};

export const ObservabilityEmbeddableComponent = withEmbeddableSubscription<
  SavedObjectEmbeddableInput,
  ObservabilityOutput,
  ObservabilityEmbeddable,
  {}
>(ObservabilityEmbeddableComponentInner);
