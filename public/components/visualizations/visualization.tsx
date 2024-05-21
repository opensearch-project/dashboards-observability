/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import isEmpty from 'lodash/isEmpty';
import { VisualizationChart } from './visualization_chart';
import { VisWorkspaceDefault } from '../event_analytics/explorer/visualizations/shared_components';
import { IVisualizationContainerProps } from '../../../common/types/explorer';
import {
  PROMQL_METRIC_SUBTYPE,
  VIS_CHART_TYPES,
  VISUALIZATION_ERROR,
} from '../../../common/constants/shared';
import { AGGREGATIONS, GROUPBY } from '../../../common/constants/explorer';

export const Visualization = ({
  visualizations,
}: {
  visualizations: IVisualizationContainerProps;
}) => {
  const isVisDataValid = (vs: IVisualizationContainerProps) => {
    const {
      data: {
        userConfigs: {
          dataConfig: {
            span = {},
            [GROUPBY]: dimensions = [],
            [AGGREGATIONS]: series = [],
            queryMetaData = {},
            metricType = '',
          } = {},
        } = {},
      },
      vis = {},
    }: IVisualizationContainerProps = vs;

    if (metricType === PROMQL_METRIC_SUBTYPE) {
      if (isEmpty(queryMetaData)) return [false, VISUALIZATION_ERROR.NO_METRIC];

      // Metric checks OK.
      return [true, ''];
    }

    // Markdown, it does not depend on if there is data
    if (vis.id === VIS_CHART_TYPES.Text) return [true, ''];

    if (isEmpty(series)) return [false, VISUALIZATION_ERROR.NO_SERIES]; // series is required to any visualization type

    // bars, pie
    if (dimensions.length < 1 && isEmpty(span)) return [false, VISUALIZATION_ERROR.INVALID_DATA];

    return [true, ''];
  };

  const [isValid, erroInfo] = isVisDataValid(visualizations);
  return (
    <>
      {isValid ? (
        <VisualizationChart visualizations={visualizations} />
      ) : (
        <VisWorkspaceDefault message={erroInfo} icon={visualizations?.vis?.icontype} />
      )}
    </>
  );
};
