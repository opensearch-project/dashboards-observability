/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-bitwise */

import { uniqueId, isEmpty } from 'lodash';
import moment from 'moment';
import React, { MutableRefObject } from 'react';
import { EuiDataGridSorting, EuiText } from '@elastic/eui';
import datemath from '@elastic/datemath';
import { HttpStart } from '../../../../../../src/core/public';
import {
  CUSTOM_LABEL,
  TIME_INTERVAL_OPTIONS,
  GROUPBY,
  AGGREGATIONS,
  BREAKDOWNS,
  DATE_PICKER_FORMAT,
} from '../../../../common/constants/explorer';
import {
  PPL_DATE_FORMAT,
  PPL_INDEX_INSERT_POINT_REGEX,
  PPL_INDEX_REGEX,
  PPL_NEWLINE_REGEX,
} from '../../../../common/constants/shared';
import {
  ConfigListEntry,
  GetTooltipHoverInfoType,
  IExplorerFields,
  IField,
  IQuery,
  MOMENT_UNIT_OF_TIME,
} from '../../../../common/types/explorer';
import PPLService from '../../../services/requests/ppl';
import { DocViewRow, IDocType } from '../explorer/events_views';
import { ConfigTooltip } from '../explorer/visualizations/config_panel/config_panes/config_controls';
import {
  GroupByChunk,
  GroupField,
  StatsAggregationChunk,
  statsChunk,
} from '../../../../common/query_manager/ast/types';

/* Builds Final Query for the surrounding events
 * -> Final Query is as follows:
 * -> finalQuery = indexPartOfQuery + timeQueryFilter + filterPartOfQuery + sortFilter
 *
 * Example Query for 5 new events:
 * -> rawQuery: source = opensearch_dashboards_sample_data_logs | where geo.src = 'US'
 * -> indexPartOfQuery = 'source = opensearch_dashboards_sample_data_logs'
 * -> filterPartOfQuery = '| where geo.src = 'US''
 * -> timeQueryFilter = ' | where tiimestamp > 2022-01-16 03:26:21.326'
 * -> sortFilter = '| sort + tiimestamp | head 5'
 * -> finalQuery = 'source logs_test | where tiimestamp > 2022-01-16 03:26:21.326 | where geo.src = 'US' | sort + timeStampField | head 5'
 */
const composeFinalQuery = (
  rawQuery: string,
  timeStampField: string,
  eventTime: string,
  numDocs: number,
  typeOfDocs: 'new' | 'old'
) => {
  const indexMatchArray = rawQuery.match(PPL_INDEX_REGEX);
  if (indexMatchArray == null) {
    throw Error('index not found in Query');
  }
  const indexPartOfQuery = indexMatchArray[0];
  const filterPartOfQuery = rawQuery.replace(PPL_INDEX_REGEX, '');
  const timeSymbol = typeOfDocs === 'new' ? '>' : '<';
  const sortSymbol = typeOfDocs === 'new' ? '+' : '-';
  const timeQueryFilter = ` | where ${timeStampField} ${timeSymbol} '${eventTime}'`;
  const sortFilter = ` | sort ${sortSymbol} ${timeStampField} | head ${numDocs}`;

  return indexPartOfQuery + timeQueryFilter + filterPartOfQuery + sortFilter;
};

const createTds = (
  docs: IDocType[],
  selectedCols: IField[],
  getTds: (doc: IDocType, selectedCols: IField[], isFlyout: boolean) => JSX.Element[]
) => {
  return docs.map((doc: IDocType) => (
    <tr className="osdDocTable__row"> {getTds(doc, selectedCols, true).slice(1)}</tr>
  ));
};

// fetches Surrounding events based on a timestamp
export const fetchSurroundingData = async (
  pplService: PPLService,
  rawQuery: string,
  timeStampField: string,
  eventTime: string,
  numDocs: number,
  typeOfDocs: 'new' | 'old',
  setEventsData: React.Dispatch<React.SetStateAction<JSX.Element[]>>,
  setIsError: React.Dispatch<React.SetStateAction<string>>,
  setLoadingData: React.Dispatch<React.SetStateAction<boolean>>,
  selectedCols: IField[],
  getTds: (doc: IDocType, selectedCols: IField[], isFlyout: boolean) => JSX.Element[]
) => {
  let resultCount = 0;
  let isErred = false;
  const pplEventTime = moment.utc(eventTime).format(PPL_DATE_FORMAT);
  setLoadingData(true);
  setIsError('');

  let finalQuery = '';
  try {
    finalQuery = composeFinalQuery(rawQuery, timeStampField, pplEventTime, numDocs, typeOfDocs);
  } catch (error) {
    const errorMessage = 'Issue in building surrounding data query';
    setIsError(errorMessage);
    isErred = true;
    console.error(errorMessage, error);
    setLoadingData(false);
    return resultCount;
  }

  await pplService
    .fetch({ query: finalQuery, format: 'jdbc' })
    .then((res) => {
      const resuleData = typeOfDocs === 'new' ? res.jsonData.reverse() : res.jsonData;
      resultCount = resuleData.length;
      setEventsData(resuleData);
    })
    .catch((error: Error) => {
      setIsError(error.message);
      isErred = true;
      console.error(error);
    })
    .finally(() => {
      setLoadingData(false);
    });

  if (resultCount !== numDocs && !isErred) {
    const errorMessage =
      resultCount !== 0
        ? `Could only find ${resultCount} ${typeOfDocs} event${resultCount === 1 ? '' : 's'}!`
        : `Could not find any ${typeOfDocs} event!`;
    setIsError(errorMessage);
  }

  return resultCount;
};

// contains 0 <= value <= 10000
export const rangeNumDocs = (value: number) => {
  return value > 10000 ? 10000 : value < 0 ? 0 : value;
};

// check traceId Byte Size
export const isValidTraceId = (traceId: string) => {
  return new Blob([traceId]).size === 32;
};

export const formatError = (name: string, message: string, details: string) => {
  return {
    name,
    message,
    body: {
      attributes: {
        error: {
          caused_by: {
            type: '',
            reason: details,
          },
        },
      },
    },
  };
};

export const hexToRgb = (
  hex: string = '#3CA1C7',
  opacity: number = 1,
  colorWithOpacity: boolean = true
) => {
  // default color PLOTLY_COLOR[0]: '#3CA1C7'
  const defaultColor = [hex, '60', '161', '199'];
  const rgbElements = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) || defaultColor;
  const [, r, g, b] = rgbElements.map((color) => parseInt(color, 16));
  const rgbaFormat = colorWithOpacity ? `rgba(${r},${g},${b},${opacity})` : `rgb(${r},${g},${b})`;
  return rgbaFormat;
};

export const lightenColor = (color: string, percent: number) => {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const B = ((num >> 8) & 0x00ff) + amt;
  const G = (num & 0x0000ff) + amt;
  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (B < 255 ? (B < 1 ? 0 : B) : 255) * 0x100 +
      (G < 255 ? (G < 1 ? 0 : G) : 255)
    )
      .toString(16)
      .slice(1)
  );
};

// Get config objects according to specific editor
export const fetchConfigObject = (editor: string, propsOptions: any) => {
  switch (editor) {
    case 'Tooltip':
      return {
        id: 'tooltip_options',
        name: 'Tooltip options',
        editor: ConfigTooltip,
        mapTo: 'tooltipOptions',
        schemas: [
          {
            name: 'Tooltip mode',
            component: null,
            mapTo: 'tooltipMode',
            props: {
              options: [
                { name: 'Show', id: 'show' },
                { name: 'Hidden', id: 'hidden' },
              ],
              defaultSelections: [{ name: 'Show', id: 'show' }],
            },
          },
          {
            name: 'Tooltip text',
            component: null,
            mapTo: 'tooltipText',
            props: propsOptions,
          },
        ],
      };
    default:
      return null;
  }
};

export const getTooltipHoverInfo = ({ tooltipMode, tooltipText }: GetTooltipHoverInfoType) => {
  if (tooltipMode === 'hidden') {
    return 'none';
  }
  if (tooltipText === undefined) {
    return 'all';
  }
  return tooltipText;
};

export const filterDataConfigParameter = (parameter: ConfigListEntry[]) =>
  parameter.filter((configItem: ConfigListEntry) => configItem.label);

export const getRoundOf = (value: number, places: number) => value.toFixed(places);

export const getPropName = (queriedVizObj: {
  customLabel?: string;
  aggregation: string;
  name: string;
  label: string;
}) => {
  if (queriedVizObj) {
    if (queriedVizObj[CUSTOM_LABEL] === '' || queriedVizObj[CUSTOM_LABEL] === undefined) {
      return `${queriedVizObj.aggregation}(${queriedVizObj.name})`;
    }
    return queriedVizObj[CUSTOM_LABEL];
  } else {
    return '';
  }
};

export const getDefaultVisConfig = (statsToken: statsChunk) => {
  if (statsToken === null) {
    return {
      [GROUPBY]: [],
      [AGGREGATIONS]: [],
      [BREAKDOWNS]: [],
    };
  }

  const groupByToken = statsToken.groupby;
  // const seriesToken = statsToken.aggregations && statsToken.aggregations[0];
  const span = getSpanValue(groupByToken);
  return {
    [AGGREGATIONS]: statsToken.aggregations.map(
      (agg: { [x: string]: any; function: { value_expression: any; name: any } }) => ({
        label: agg.function?.value_expression,
        name: agg.function?.value_expression,
        aggregation: agg.function?.name,
        [CUSTOM_LABEL]: agg[CUSTOM_LABEL as keyof StatsAggregationChunk],
      })
    ),
    [GROUPBY]: groupByToken?.group_fields?.map((agg: { [x: string]: any; name: any }) => ({
      label: agg.name ?? '',
      name: agg.name ?? '',
      [CUSTOM_LABEL]: agg[CUSTOM_LABEL as keyof GroupField] ?? '',
    })),
    span,
  };
};

const getSpanValue = (groupByToken: GroupByChunk) => {
  const timeUnitValue = TIME_INTERVAL_OPTIONS.find(
    (timeUnit) => timeUnit.value === groupByToken?.span?.span_expression.time_unit
  )?.text;
  return !isEmpty(groupByToken?.span)
    ? {
        time_field: [
          {
            name: groupByToken?.span?.span_expression?.field,
            type: 'timestamp',
            label: groupByToken?.span?.span_expression?.field,
          },
        ],
        unit: [
          {
            text: timeUnitValue,
            value: groupByToken?.span?.span_expression?.time_unit,
            label: timeUnitValue,
          },
        ],
        interval: groupByToken?.span?.span_expression?.literal_value,
      }
    : undefined;
};

/**
 * Use startTime and endTime as date range if both exists, else use selectDatarange
 * in query state, if this is also empty then use default 15mins as default date range
 * @param startTime
 * @param endTime
 * @param queryState
 * @returns [startTime, endTime]
 */
export const getDateRange = (
  startTime: string | undefined,
  endTime: string | undefined,
  queryState: IQuery
) => {
  if (startTime && endTime) return [startTime, endTime];
  const { selectedDateRange } = queryState;
  if (!isEmpty(selectedDateRange)) return [selectedDateRange[0], selectedDateRange[1]];
  return ['now-15m', 'now'];
};

export const getContentTabTitle = (tabID: string, tabTitle: string) => {
  return (
    <>
      <EuiText data-test-subj={`${tabID}Tab`} size="s" textAlign="left" color="default">
        <span className="tab-title">{tabTitle}</span>
      </EuiText>
    </>
  );
};

/**
 * Used to fill in missing empty data where x is an array of time values and there are only x
 * values when y is non-zero.
 * @param xVals all x values being used
 * @param yVals all y values being used
 * @param intervalPeriod Moment unitOfTime used to dictate how long each interval is
 * @param startTime starting time of x values
 * @param endTime ending time of x values
 * @returns an object with buckets and values where the buckets are all of the new x values and
 * values are the corresponding values which include y values that are 0 for empty data
 */
export const fillTimeDataWithEmpty = (
  xVals: string[],
  yVals: number[],
  intervalPeriod: MOMENT_UNIT_OF_TIME,
  startTime: string,
  endTime: string
): { buckets: string[]; values: number[] } => {
  // parses out datetime for start and end, then reformats
  const startDate = datemath
    .parse(startTime)
    ?.startOf(intervalPeriod === 'w' ? 'isoWeek' : intervalPeriod);
  const endDate = datemath
    .parse(endTime)
    ?.startOf(intervalPeriod === 'w' ? 'isoWeek' : intervalPeriod);

  // find the number of buckets
  // below essentially does ((end - start) / interval_period) + 1
  const numBuckets = endDate.diff(startDate, intervalPeriod) + 1;

  // populate buckets as x values in the graph
  const buckets = [startDate.format(DATE_PICKER_FORMAT)];
  const currentDate = startDate;
  for (let i = 1; i < numBuckets; i++) {
    const nextBucket = currentDate.add(1, intervalPeriod);
    buckets.push(nextBucket.format(DATE_PICKER_FORMAT));
  }

  // create y values, use old y values if they exist
  const values: number[] = [];
  buckets.forEach((bucket) => {
    const bucketIndex = xVals.findIndex((x: string) => x === bucket);
    if (bucketIndex !== -1) {
      values.push(yVals[bucketIndex]);
    } else {
      values.push(0);
    }
  });

  return { buckets, values };
};

export const redoQuery = (
  startTime: string,
  endTime: string,
  rawQuery: string,
  timeStampField: string,
  sortingFields: MutableRefObject<EuiDataGridSorting['columns']>,
  pageFields: MutableRefObject<number[]>,
  fetchEvents: any,
  setData: React.Dispatch<React.SetStateAction<any[]>>
) => {
  let finalQuery = '';

  const start = datemath.parse(startTime)?.utc().format(DATE_PICKER_FORMAT);
  const end = datemath.parse(endTime, { roundUp: true })?.utc().format(DATE_PICKER_FORMAT);
  const tokens = rawQuery.replaceAll(PPL_NEWLINE_REGEX, '').match(PPL_INDEX_INSERT_POINT_REGEX);

  finalQuery = `${tokens![1]}=${
    tokens![2]
  } | where ${timeStampField} >= '${start}' and ${timeStampField} <= '${end}'`;

  finalQuery += tokens![3];

  for (let i = 0; i < sortingFields.current.length; i++) {
    const field = sortingFields.current[i];
    const dir = field.direction === 'asc' ? '+' : '-';
    finalQuery = finalQuery + ` | sort ${dir} ${field.id}`;
  }

  finalQuery =
    finalQuery +
    ` | head ${pageFields.current[1]} from ${pageFields.current[0] * pageFields.current[1]}`;

  fetchEvents({ query: finalQuery }, 'jdbc', (res: any) => {
    setData(res.jsonData);
  });
};
