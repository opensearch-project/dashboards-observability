/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import dateMath from '@elastic/datemath';
import { Moment } from 'moment-timezone';
import { isEmpty } from 'lodash';
import moment from 'moment';
import {
  DATE_PICKER_FORMAT,
  PPL_DEFAULT_PATTERN_REGEX_FILETER,
} from '../../../../common/constants/explorer';
import {
  PPL_DATE_FORMAT,
  PPL_INDEX_INSERT_POINT_REGEX,
  PPL_INDEX_REGEX,
  PPL_NEWLINE_REGEX,
} from '../../../../common/constants/shared';

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

export const convertDateTime = (
  datetime: string,
  isStart = true,
  formatted = true,
  isMetrics: boolean = false
) => {
  let returnTime: undefined | Moment;
  if (isStart) {
    returnTime = dateMath.parse(datetime);
  } else {
    returnTime = dateMath.parse(datetime, { roundUp: true });
  }
  if (isMetrics) {
    const myDate = new Date(returnTime._d); // Your timezone!
    const epochTime = myDate.getTime() / 1000.0;
    return Math.round(epochTime);
  }
  if (formatted) return returnTime!.utc().format(PPL_DATE_FORMAT);
  return returnTime;
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
  console.log('updatePromQLQueryFilters', {
    connection,
    metric,
    aggregation,
    attributesGroupBy,
    promQLQuery,
  });
  const promQLPart = buildPromQLFromMetricQuery({
    metric,
    attributesGroupBy: attributesGroupBy.split(','),
    aggregation,
  });
  const start = convertDateTime(startTime, true, false, true);
  const end = convertDateTime(endTime, false, false, true);
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

  const formattedStart = moment(start).utc().format(DATE_PICKER_FORMAT);
  const formattedEnd = moment(end).utc().format(DATE_PICKER_FORMAT);

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
  let fullQuery: string;
  if (baseQuery) {
    fullQuery = baseQuery;
    if (currQuery) {
      fullQuery += '| ' + currQuery;
    }
  } else {
    fullQuery = currQuery;
  }
  return fullQuery;
};

export const buildRawQuery = (query: any, appBaseQuery: string) => {
  const rawQueryStr = (query.rawQuery as string).includes(appBaseQuery)
    ? query.rawQuery
    : buildQuery(appBaseQuery, query.rawQuery);
  return rawQueryStr;
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

export const removeBacktick = (stringContainsBacktick: string) => {
  if (!stringContainsBacktick) return '';
  return stringContainsBacktick.replace(/`/g, '');
};
