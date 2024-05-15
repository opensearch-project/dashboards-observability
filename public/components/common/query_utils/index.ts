/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import dateMath from '@elastic/datemath';
import { Moment } from 'moment-timezone';
import isEmpty from 'lodash/isEmpty';
import { SearchMetaData } from '../../event_analytics/redux/slices/search_meta_data_slice';
import {
  PPL_DEFAULT_PATTERN_REGEX_FILETER,
  SELECTED_DATE_RANGE,
  SELECTED_FIELDS,
  SELECTED_TIMESTAMP,
} from '../../../../common/constants/explorer';
import {
  PPL_DATE_FORMAT,
  PPL_INDEX_INSERT_POINT_REGEX,
  PPL_INDEX_REGEX,
  PPL_NEWLINE_REGEX,
  OTEL_DATE_FORMAT,
  OTEL_METRIC_SUBTYPE,
  PROMQL_METRIC_SUBTYPE,
  PPL_DESCRIBE_INDEX_REGEX,
} from '../../../../common/constants/shared';
import { IExplorerFields, IQuery } from '../../../../common/types/explorer';
import { SPAN_RESOLUTION_REGEX } from '../../../../common/constants/metrics';

/*
 * "Query Utils" This file contains different reused functions in operational panels
 *
 * convertDateTime - Converts input datetime string to required format
 */

/**
 * @param literal - string literal that will be put inside single quotes in PPL command
 * @returns string with inner single quotes escaped
 */
const escapeQuotes = (literal: string) => {
  return literal.replaceAll("'", "''");
};

export const findMinInterval = (start: string = '', end: string = '') => {
  const momentStart = dateMath.parse(start)!;
  const momentEnd = dateMath.parse(end, { roundUp: true })!;
  const diffSeconds = momentEnd.unix() - momentStart.unix();
  let minInterval = 'y';

  // less than 1 second
  if (diffSeconds <= 1) minInterval = 'ms';
  // less than 2 minutes
  else if (diffSeconds <= 60 * 2) minInterval = 's';
  // less than 2 hours
  else if (diffSeconds <= 3600 * 2) minInterval = 'm';
  // less than 2 days
  else if (diffSeconds <= 86400 * 2) minInterval = 'h';
  // less than 1 month
  else if (diffSeconds <= 86400 * 31) minInterval = 'd';
  // less than 2 year
  else if (diffSeconds <= 86400 * 366 * 2) minInterval = 'w';

  return minInterval;
};

export const convertDateTime = (
  datetime: string,
  isStart = true,
  formatted = true,
  metricType: string = ''
) => {
  let returnTime: Moment = '';

  if (isStart) {
    returnTime = dateMath.parse(datetime);
  } else {
    returnTime = dateMath.parse(datetime, { roundUp: true });
  }

  if (metricType === OTEL_METRIC_SUBTYPE) {
    const formattedDate = returnTime!.utc().format(OTEL_DATE_FORMAT);
    const milliseconds = returnTime!.millisecond();
    const formattedMilliseconds = String(milliseconds).padEnd(6, '0');
    return `${formattedDate}.${formattedMilliseconds}Z`;
  }

  if (metricType === PROMQL_METRIC_SUBTYPE) {
    const myDate = new Date(returnTime._d); // Your timezone!
    const epochTime = myDate.getTime() / 1000.0;
    return Math.round(epochTime);
  }
  if (formatted === true) return returnTime?.utc()?.format(PPL_DATE_FORMAT);
  if (formatted) return returnTime?.utc()?.format(formatted);

  return returnTime;
};

export const updateCatalogVisualizationQuery = ({
  catalogSourceName,
  catalogTableName,
  aggregation,
  attributesGroupBy,
  start,
  end,
  span = '1',
  resolution = 'h',
}: {
  catalogSourceName: string;
  catalogTableName: string;
  aggregation: string;
  attributesGroupBy: string[];
  start: string;
  end: string;
  span: string;
  resolution: string;
}) => {
  const attributesGroupString = attributesGroupBy.join(',');
  const startEpochTime = convertDateTime(start, true, false, PROMQL_METRIC_SUBTYPE);
  const endEpochTime = convertDateTime(end, false, false, PROMQL_METRIC_SUBTYPE);
  const promQuery =
    attributesGroupBy.length === 0
      ? `${aggregation} (${catalogTableName})`
      : `${aggregation} by(${attributesGroupString}) (${catalogTableName})`;

  const newQuery = `source = ${catalogSourceName}.query_range('${promQuery}', ${startEpochTime}, ${endEpochTime}, '${span}${resolution}')`;
  return newQuery;
};

const PROMQL_DEFAULT_AGGREGATION = 'avg';
const PROMQL_CATALOG_ONLY_INDEX = /^(?<connection>[^|\s]+)\.(?<metric>\S+)$/i;
const PROMQL_INDEX_REGEX = /(?<connection>[^|\s]+)\.query_range\('(?<promql>.+?)'/i;
const PROMQL_AGG_ATTR_REGEX = /(?<aggregation>\S+) *?(by ?\((?<attributesGroupBy>.*?))\)? *?\((?<metric>\S+)\)/i;
const PROMQL_METRIC_ONLY_REGEX = /^[(^\s]*?(?<metric>[_.a-z0-9]+)\)?/i;

const parsePromQLWithMetricOnly = (promQL: string) =>
  promQL.match(PROMQL_METRIC_ONLY_REGEX)?.groups;
const parsePromQLWithAggAndAttrs = (promQL: string) => promQL.match(PROMQL_AGG_ATTR_REGEX)?.groups;

interface PromQLKeywords {
  connection: string;
  metric: string;
  aggregation: string;
  attributesGroupBy: string;
}

export const parsePromQLIntoKeywords = (query: string): PromQLKeywords | undefined => {
  const catalogMatch = query.match(PROMQL_CATALOG_ONLY_INDEX);
  if (catalogMatch) {
    return {
      ...(catalogMatch.groups as { metric: string; connection: string }),
      aggregation: PROMQL_DEFAULT_AGGREGATION,
      attributesGroupBy: '',
    };
  }

  const indexMatch = query.match(PROMQL_INDEX_REGEX);
  const { connection, promql } = indexMatch?.groups ?? {};
  if (!connection || !promql) return;

  const promTokens = parsePromQLWithAggAndAttrs(promql) || parsePromQLWithMetricOnly(promql);
  if (!promTokens || !promTokens.metric) return;

  promTokens.aggregation ??= PROMQL_DEFAULT_AGGREGATION;
  promTokens.attributesGroupBy ??= '';

  return { ...promTokens, connection };
};

export const getPromQLIndex = (query: string): string | undefined => {
  const match = parsePromQLIntoKeywords(query);
  if (!match) return;

  const { connection, metric } = match!;
  if (connection && metric) return connection + '.' + metric;
};

export const isPromQLQuery = (query: string): boolean => !!parsePromQLIntoKeywords(query);

export const buildPromQLFromMetricQuery = ({
  metric,
  aggregation,
  attributesGroupBy,
}: {
  metric: string;
  aggregation: string;
  attributesGroupBy: string[];
}): string => {
  const attrs = attributesGroupBy.length > 0 ? `by (${attributesGroupBy.join(',')})` : '';

  return `${aggregation} ${attrs} (${metric})`;
};

export const updatePromQLQueryFilters = (
  promQLQuery: string,
  startTime: string,
  endTime: string
) => {
  const { connection, metric, aggregation, attributesGroupBy } = parsePromQLIntoKeywords(
    promQLQuery
  );

  const promQLPart = buildPromQLFromMetricQuery({
    metric,
    attributesGroupBy: attributesGroupBy.split(','),
    aggregation,
  });
  const start = convertDateTime(startTime, true, false, PROMQL_METRIC_SUBTYPE);
  const end = convertDateTime(endTime, false, false, PROMQL_METRIC_SUBTYPE);
  return `source = ${connection}.query_range('${promQLPart}', ${start}, ${end}, '1h')`;
};

const getPPLIndex = (query: string): string => {
  const matches = query.match(PPL_INDEX_REGEX);
  if (matches) {
    return matches[2];
  }
  return '';
};

export const getIndexPatternFromRawQuery = (query: string): string => {
  return getPromQLIndex(query) || getPPLIndex(query);
};

export const getDescribeQueryIndexFromRawQuery = (query: string): string | undefined => {
  const matches = query.match(PPL_DESCRIBE_INDEX_REGEX);
  if (matches) {
    return matches[2];
  }
  return undefined;
};

function extractSpanAndResolution(query: string) {
  if (!query) return;

  const match = query.match(SPAN_RESOLUTION_REGEX);
  return match ? { span: parseInt(match[1], 10), resolution: match[2] } : null;
}

export const preprocessMetricQuery = ({ metaData, startTime, endTime }) => {
  // convert to moment
  const start = convertDateTime(startTime, true);
  const end = convertDateTime(endTime, false);
  const spanResolution = extractSpanAndResolution(metaData?.query);

  const visualizationQuery = updateCatalogVisualizationQuery({
    ...metaData.queryMetaData,
    start,
    end,
    span: spanResolution?.span || 1,
    resolution: spanResolution?.resolution || 'h',
  });

  return visualizationQuery;
};

// insert time filter command and additional commands based on raw query
export const preprocessQuery = ({
  rawQuery,
  startTime,
  endTime,
  timeField,
  isLiveQuery,
  selectedPatternField,
  patternRegex,
  filteredPattern,
  whereClause,
}: {
  rawQuery: string;
  startTime: string;
  endTime: string;
  timeField?: string;
  isLiveQuery: boolean;
  selectedPatternField?: string;
  patternRegex?: string;
  filteredPattern?: string;
  whereClause?: string;
}) => {
  let finalQuery = '';
  if (isEmpty(rawQuery)) return finalQuery;

  // convert to moment
  const start = convertDateTime(startTime, true);
  const end = convertDateTime(endTime, false);

  if (!start || !end) return finalQuery;

  const promQLTokens = parsePromQLIntoKeywords(rawQuery);

  if (promQLTokens?.connection) {
    return updatePromQLQueryFilters(rawQuery, startTime, endTime);
  }

  const tokens = rawQuery.replaceAll(PPL_NEWLINE_REGEX, '').match(PPL_INDEX_INSERT_POINT_REGEX);

  if (isEmpty(tokens)) return finalQuery;

  finalQuery = `${tokens![1]}=${
    tokens![2]
  } | where ${timeField} >= '${start}' and ${timeField} <= '${end}'`;

  if (whereClause) {
    finalQuery += ` AND ${whereClause}`;
  }

  finalQuery += tokens![3];

  if (isLiveQuery) {
    finalQuery = finalQuery + ` | sort - ${timeField}`;
  }

  // if a pattern is selected as filter, build it into finalQuery
  if (selectedPatternField && filteredPattern)
    finalQuery = buildPatternsQuery(
      finalQuery,
      selectedPatternField,
      patternRegex,
      filteredPattern
    );

  return finalQuery;
};

export const buildPatternsQuery = (
  baseQuery: string,
  selectedPatternField?: string,
  patternRegex?: string,
  filteredPattern?: string
) => {
  let finalQuery = baseQuery;
  if (selectedPatternField) {
    finalQuery += ` | patterns `;
    if (patternRegex && patternRegex !== PPL_DEFAULT_PATTERN_REGEX_FILETER) {
      finalQuery += `pattern='${escapeQuotes(patternRegex)}' `;
    }
    finalQuery += `\`${selectedPatternField}\` `;
    if (filteredPattern) {
      finalQuery += `| where patterns_field='${escapeQuotes(filteredPattern)}'`;
    }
  }
  return finalQuery;
};

export const buildQuery = (baseQuery: string, currQuery: string) => {
  if (!currQuery) return baseQuery;
  return `${baseQuery} | ${currQuery}`;
};

export const buildRawQuery = (query: IQuery, appBaseQuery: string) => {
  if (appBaseQuery && !query.rawQuery.includes(appBaseQuery))
    return buildQuery(appBaseQuery, query.rawQuery);
  return query.rawQuery;
};

export const composeFinalQuery = (
  curQuery: string,
  startingTime: string,
  endingTime: string,
  timeField: string,
  isLiveQuery: boolean,
  appBaseQuery: string,
  selectedPatternField?: string,
  patternRegex?: string,
  filteredPattern?: string
) => {
  const fullQuery = curQuery.includes(appBaseQuery) ? curQuery : buildQuery(appBaseQuery, curQuery);
  if (isEmpty(fullQuery)) return '';
  return preprocessQuery({
    rawQuery: fullQuery,
    startTime: startingTime,
    endTime: endingTime,
    timeField,
    isLiveQuery,
    selectedPatternField,
    patternRegex,
    filteredPattern,
  });
};

export const composeFinalQueryWithoutTimestamp = (
  curQuery: string,
  appBaseQuery: string,
  selectedPatternField?: string,
  patternRegex?: string,
  filteredPattern?: string
) => {
  let fullQuery = curQuery.includes(appBaseQuery) ? curQuery : buildQuery(appBaseQuery, curQuery);
  if (isEmpty(fullQuery)) return '';

  // if a pattern is selected as filter, build it into finalQuery
  if (selectedPatternField && filteredPattern)
    fullQuery = buildPatternsQuery(fullQuery, selectedPatternField, patternRegex, filteredPattern);

  return fullQuery;
};

export const removeBacktick = (stringContainsBacktick: string) => {
  if (!stringContainsBacktick) return '';
  return stringContainsBacktick.replace(/`/g, '');
};

export const getSavingCommonParams = (
  queryState: IQuery,
  appBaseQuery: string,
  fields: IExplorerFields,
  savingTitle: string,
  explorerSearchMeta: SearchMetaData
) => {
  return {
    dataSources: JSON.stringify([
      {
        name: explorerSearchMeta.datasources?.[0]?.name || '',
        type: explorerSearchMeta.datasources?.[0]?.type || '',
        label: explorerSearchMeta.datasources?.[0]?.label || '',
        value: explorerSearchMeta.datasources?.[0]?.value || '',
      },
    ]),
    queryLang: explorerSearchMeta.lang,
    query: buildRawQuery(queryState, appBaseQuery),
    fields: fields[SELECTED_FIELDS],
    dateRange: queryState[SELECTED_DATE_RANGE],
    name: savingTitle,
    timestamp: queryState[SELECTED_TIMESTAMP],
  };
};
