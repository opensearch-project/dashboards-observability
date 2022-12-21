/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty, take } from 'lodash';
import { getVisType } from '../vis_types';
import { IVisualizationContainerProps, IField, IQuery } from '../../../../../common/types/explorer';
import { visChartTypes } from '../../../../../common/constants/shared';

interface IVizContainerProps {
  vizId: string;
  appData?: { fromApp: boolean };
  rawVizData?: any;
  query?: IQuery;
  indexFields?: IField[];
  userConfigs?: any;
  defaultAxes?: {
    xaxis: IField[];
    yaxis: IField[];
  };
}

const getDefaultXYAxisLabels = (vizFields: IField[], visName: string) => {
  if (isEmpty(vizFields)) return {};
  const vizFieldsWithLabel: ({ [key: string]: string })[] = vizFields.map(vizField => ({ ...vizField, label: vizField.name }));

  const mapXaxis = (): ({ [key: string]: string })[] => visName === visChartTypes.Line ?
    vizFieldsWithLabel.filter((field) => field.type === 'timestamp') :
    [vizFieldsWithLabel[vizFieldsWithLabel.length - 1]];

  const mapYaxis = (): ({ [key: string]: string })[] => visName === visChartTypes.Line ?
    vizFieldsWithLabel.filter((field) => field.type !== 'timestamp')
    : take(vizFieldsWithLabel, vizFieldsWithLabel.length - 1 > 0 ? vizFieldsWithLabel.length - 1 : 1) || [];

  return { xaxis: mapXaxis(), yaxis: mapYaxis() };
};

export const getVizContainerProps = ({
  vizId,
  rawVizData = {},
  query = {},
  indexFields = {},
  userConfigs = {},
  appData = {},
}: IVizContainerProps): IVisualizationContainerProps => {
  const visType = {
    ...getVisType(vizId),
  }
  return {
    data: {
      appData: { ...appData },
      rawVizData: { ...rawVizData },
      query: { ...query },
      indexFields: { ...indexFields },
      userConfigs: { ...userConfigs },
      defaultAxes: {
        ...getDefaultXYAxisLabels(rawVizData?.metadata?.fields, visType.name),
      },
    },
    vis: visType,
  };
};
