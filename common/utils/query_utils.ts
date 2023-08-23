/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import datemath from '@elastic/datemath';
import { isEmpty } from 'lodash';
import {
  DATE_PICKER_FORMAT,
  PPL_DEFAULT_PATTERN_REGEX_FILETER,
} from '../../common/constants/explorer';
import {
  PPL_INDEX_INSERT_POINT_REGEX,
  PPL_INDEX_REGEX,
  PPL_NEWLINE_REGEX,
} from '../../common/constants/shared';

export interface QueryUtilPreProcessInput {
  rawQuery: string;
  startTime: string;
  endTime: string;
  timeField?: string;
  isLiveQuery: boolean;
  selectedPatternField?: string;
  patternRegex?: string;
  filteredPattern?: string;
  whereClause?: string;
}

export abstract class QueryUtil {
  abstract preProcessQuery(input: QueryUtilPreProcessInput): string;

  abstract buildRawQuery(query: any, appBaseQuery: string): string;
}

/**
 * @param literal - string literal that will be put inside single quotes in PPL command
 * @returns string with inner single quotes escaped
 */
const escapeQuotes = (literal: string) => {
  return literal.replaceAll("'", "''");
};

export const getIndexPatternFromRawQuery = (query: string): string => {
  const matches = query.match(PPL_INDEX_REGEX);
  if (matches) {
    return matches[2];
  }
  return '';
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
