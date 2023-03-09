/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty, forEach, mapKeys } from 'lodash';
import { CUSTOM_LABEL } from '../../../../../common/constants/explorer';
import {
  ConfigList,
  DimensionSpan,
  VisSpecificMetaData,
} from '../../../../../common/types/explorer';
import { removeBacktick } from '../../../../../common/utils';

export const getCompleteTimespanKey = (span: DimensionSpan) => {
  if (isEmpty(span) || isEmpty(span.time_field) || isEmpty(span.interval) || isEmpty(span.unit))
    return '';
  const spanName = `span(${span.time_field[0]?.name},${span.interval}${span.unit[0]?.value})`;
  return { name: spanName, label: spanName };
};

/**
 * Transform to traces that can be consumed by plotly.
 * @param intermediateVisData preprocessed json data that has dimensions to single aggregation mapping.
 * @param param1 required visualization configurations.
 * @returns traces.
 */
export const transformPreprocessedDataToTraces = (
  intermediateVisData: any[],
  { breakdowns, isVertical = true }: Partial<ConfigList>,
  visTypeMetaData: VisSpecificMetaData
) => {
  const traceMap = new Map<string, any>();
  const hasBreakdown = !isEmpty(breakdowns);
  forEach(intermediateVisData, (entry) => {
    const traceKey = hasBreakdown ? [entry.breakdown, entry.aggName].join(',') : entry.aggName;
    const xCoordinate = visTypeMetaData.x_coordinate;
    const yCoordinate = visTypeMetaData.y_coordinate;

    if (isEmpty(traceMap.get(traceKey))) {
      traceMap.set(traceKey, {
        [xCoordinate]: isVertical ? [entry.x] : [entry.value],
        [yCoordinate]: isVertical ? [entry.value] : [entry.x],
        name: hasBreakdown ? [entry.breakdown, entry.aggName].join(',') : `${traceKey}`,
      });
    } else {
      const curTrace = traceMap.get(traceKey);
      const xaxisValue = isVertical ? entry.x : entry.value;
      const yaxisValue = isVertical ? entry.value : entry.x;
      curTrace![xCoordinate].push(xaxisValue);
      curTrace![yCoordinate].push(yaxisValue);
    }
  });
  return [...traceMap.values()];
};

export const removeBackTick = (entry: any) => {
  return {
    ...mapKeys(entry, (val: any, key: string) => removeBacktick(key)),
  };
};

/**
 * preprocess json data to
 * 1. concatenate dimensions to generate one dimension
 * 2. concatenate breakdowns (if there's any) generate one breakdown
 * 3. map dimension/breakdown to aggregations
 * @param visJson raw json data from data fetching
 * @param param1 required visualization configurations.
 * @returns intermediate visualization json data
 */
export const preprocessJsonData = (
  jdbcFieldValueMapList: any[],
  { dimensions, series, breakdowns, span }: Partial<ConfigList>
) => {
  const seriesFlattenedEntries = [];
  forEach(jdbcFieldValueMapList, (entry: any) => {
    const backtickRemovedEntry = {
      ...removeBackTick(entry),
    };

    forEach(series, (sr) => {
      let tabularVizData = {};
      const serieKey = sr[CUSTOM_LABEL] ? sr[CUSTOM_LABEL] : `${sr.aggregation}(${sr.name})`;
      if (!isEmpty(serieKey)) {
        const concatedXaxisLabel = [
          ...(!isEmpty(span) ? [getCompleteTimespanKey(span)] : []),
          ...dimensions,
        ]
          .map((dimension) => {
            return backtickRemovedEntry[removeBacktick(dimension.name)] ?? '';
          })
          .join(',');
        const concatedBreakdownLabel = breakdowns
          ? breakdowns
              .map((breakdown) => backtickRemovedEntry[removeBacktick(breakdown.name)])
              .join(',')
          : '';
        tabularVizData = {
          value: backtickRemovedEntry[serieKey],
          x: concatedXaxisLabel,
          breakdown: concatedBreakdownLabel,
          aggName: serieKey,
        };
      } else {
        tabularVizData = {
          value: 0,
          x: '',
          breakdown: '',
        };
      }
      seriesFlattenedEntries.push(tabularVizData);
    });
  });
  return seriesFlattenedEntries;
};
