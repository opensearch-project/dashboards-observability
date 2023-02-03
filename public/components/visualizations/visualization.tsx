/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { isEmpty } from 'lodash';
import { VisualizationChart } from './visualization_chart';
import { VisCanvassPlaceholder } from '../event_analytics/explorer/visualizations/shared_components';
import { IVisualizationContainerPropsVis } from '../../../common/types/explorer';
import { MARKDOWN_VIS_ID } from '../../../common/constants/shared';

export const Visualization = ({
  visualizations,
}: {
  visualizations: IVisualizationContainerPropsVis;
}) => {
  return (
    <>
      {!isEmpty(visualizations?.data?.rawVizData?.data) ||
      visualizations?.vis?.id === MARKDOWN_VIS_ID ? (
        <VisualizationChart visualizations={visualizations} />
      ) : (
        <VisCanvassPlaceholder message={'No data found'} icon={visualizations?.vis?.icontype} />
      )}
    </>
  );
};
