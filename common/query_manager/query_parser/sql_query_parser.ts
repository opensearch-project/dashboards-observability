/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { statsChunk } from '../ast/types/stats';

/**
 * This is a temporary solution before introducing SQL antlrs.
 * @param query - sql query
 */
export const getGroupBy = (query: string): Pick<statsChunk, 'aggregations' | 'groupby'> => {
  let match;
  const regex = /(?:SELECT\s+)?(?:(\w+)\(([^\)]+)\))(?:\s+AS\s+(\S+))?\s*(?:,|\bFROM\b|$)|(?:GROUP\s+BY\s+)(?:SPAN\(([^,]+?)(?:\s*,\s*)(\d+)(\w+)\)(?:\s+AS\s+(\S+))?)?((?:(?:\s*,\s*)?(?:[^\s,]+))+)/gi;
  const chunk: Pick<statsChunk, 'aggregations' | 'groupby'> = {
    aggregations: [],
    groupby: { group_fields: [], span: null },
  };

  while ((match = regex.exec(query)) !== null) {
    for (let i = 0; i < match.length; i++) {
      if (match[i] === undefined) match[i] = '';
    }

    const [
      _,
      aggFunc,
      aggExpr,
      aggAlias,
      spanField,
      spanAmount,
      spanUnit,
      spanAlias,
      groupByFields,
    ] = match;
    if (aggFunc) {
      chunk.aggregations.push({
        function_alias: aggAlias,
        function: {
          name: aggFunc,
          value_expression: aggExpr,
          percentile_agg_function: '',
        },
      });
    }
    if (spanField && spanAmount && spanUnit) {
      chunk.groupby.span = {
        customLabel: spanAlias,
        span_expression: {
          field: spanField,
          type: '',
          literal_value: spanAmount,
          time_unit: spanUnit,
        },
      };
    }
    if (groupByFields) {
      chunk.groupby.group_fields.push(
        ...groupByFields
          .split(',')
          .map((field) => ({ name: field.replace(/^\s*`?|`?\s*$/g, '') }))
          .filter((field) => field.name)
      );
    }
  }
  return chunk;
};
