/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Filter, getFilterField } from '../../../../../src/plugins/data/common';

/**
 * Parse core {@link Filter} and convert to a PPL where clause. Only supports
 * non DSL filters.
 */
export const parseFilters = (filters?: Filter[]) => {
  if (!filters) return '';
  return filters
    .filter((filter) => !filter.meta.disabled)
    .map(parseFilter)
    .join(' AND ');
};

const parseFilter = (filter: Filter): string => {
  const meta = filter.meta;
  const field = getFilterField(filter);
  if (!meta.negate) {
    switch (meta.type) {
      case 'phrase':
        return `\`${field}\` = '${meta.params.query}'`;
      case 'phrases':
        return meta.params.map((query: string) => `\`${field}\` = '${query}'`).join(' OR ');
      case 'range':
        const ranges = [];
        if (meta.params.gte != null) ranges.push(`\`${field}\` >= ${meta.params.gte}`);
        if (meta.params.lt != null) ranges.push(`\`${field}\` < ${meta.params.lt}`);
        return ranges.join(' AND ');
      case 'exists':
        return `isnotnull(\`${field}\`)`;
    }
  } else {
    switch (meta.type) {
      case 'phrase':
        return `\`${field}\` != '${meta.params.query}'`;
      case 'phrases':
        return meta.params.map((query: string) => `\`${field}\` != '${query}'`).join(' AND ');
      case 'range':
        const ranges = [];
        if (meta.params.gte != null) ranges.push(`\`${field}\` < ${meta.params.gte}`);
        if (meta.params.lt != null) ranges.push(`\`${field}\` >= ${meta.params.lt}`);
        return ranges.join(' OR ');
      case 'exists':
        return `isnotnull(\`${field}\`)`;
    }
  }
  return '';
};
