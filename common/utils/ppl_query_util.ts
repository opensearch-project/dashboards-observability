/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isEmpty } from 'lodash';
import datemath from '@elastic/datemath';

import { QueryUtil, QueryUtilPreProcessInput } from './query_utils';
import {
  DATE_PICKER_FORMAT,
  PPL_DEFAULT_PATTERN_REGEX_FILETER,
} from '../../common/constants/explorer';
import {
  PPL_INDEX_INSERT_POINT_REGEX,
  PPL_INDEX_REGEX,
  PPL_NEWLINE_REGEX,
} from '../../common/constants/shared';

export class PPLQueryUtil extends QueryUtil {
  // insert time filter command and additional commands based on raw query
  public preProcessQuery({
    rawQuery,
    startTime,
    endTime,
    timeField,
    isLiveQuery,
    selectedPatternField,
    patternRegex,
    filteredPattern,
    whereClause,
  }: QueryUtilPreProcessInput) {
    let finalQuery = '';

    if (isEmpty(rawQuery)) return finalQuery;

    // convert to moment
    const start = datemath.parse(startTime)?.utc().format(DATE_PICKER_FORMAT);
    const end = datemath.parse(endTime, { roundUp: true })?.utc().format(DATE_PICKER_FORMAT);
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
      finalQuery = this.buildPatternsQuery(
        finalQuery,
        selectedPatternField,
        patternRegex,
        filteredPattern
      );

    return finalQuery;
  }

  public buildRawQuery(query: any, appBaseQuery: string) {
    const rawQueryStr = (query.rawQuery as string).includes(appBaseQuery)
      ? query.rawQuery
      : this.buildQuery(appBaseQuery, query.rawQuery);
    return rawQueryStr;
  }

  private buildQuery(baseQuery: string, currQuery: string) {
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
  }

  private buildPatternsQuery(
    baseQuery: string,
    selectedPatternField?: string,
    patternRegex?: string,
    filteredPattern?: string
  ) {
    let finalQuery = baseQuery;
    if (selectedPatternField) {
      finalQuery += ` | patterns `;
      if (patternRegex && patternRegex !== PPL_DEFAULT_PATTERN_REGEX_FILETER) {
        finalQuery += `pattern='${this.escapeQuotes(patternRegex)}' `;
      }
      finalQuery += `\`${selectedPatternField}\` `;
      if (filteredPattern) {
        finalQuery += `| where patterns_field='${this.escapeQuotes(filteredPattern)}'`;
      }
    }
    return finalQuery;
  }

  /**
   * @param literal - string literal that will be put inside single quotes in PPL command
   * @returns string with inner single quotes escaped
   */
  private escapeQuotes(literal: string) {
    return literal.replaceAll("'", "''");
  }
}
