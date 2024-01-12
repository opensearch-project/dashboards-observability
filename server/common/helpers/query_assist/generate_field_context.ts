/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiResponse } from '@opensearch-project/opensearch';
import {
  IndicesGetMappingResponse,
  MappingProperty,
  SearchResponse,
} from '@opensearch-project/opensearch/api/types';
import { get } from 'lodash';

/**
 * @template T = unknown - mapping Context
 * @template U = unknown - search Context
 * @param mappings - mapping from get mappings request
 * @param hits - search response that contains a sample document
 * @returns a string that describes fields, types, and sample values
 */
export const generateFieldContext = <T = unknown, U = unknown>(
  mappings: ApiResponse<IndicesGetMappingResponse, T>,
  hits: ApiResponse<SearchResponse<U>, U>
) => {
  const flattenedFields = flattenMappings(mappings);
  const source = hits.body.hits.hits[0]?._source;

  return Object.entries(flattenedFields)
    .filter(([, type]) => type !== 'alias') // PPL doesn't support 'alias' type
    .map(([field, type]) => {
      return `- ${field}: ${type} (${extractValue(source, field, type)})`;
    })
    .join('\n');
};

const extractValue = (source: unknown | undefined, field: string, type: string) => {
  const value = get(source, field);
  if (value === undefined) return null;
  if (['text', 'keyword'].includes(type)) return `"${value}"`;
  return value;
};

/**
 * Flatten mappings response to an object of fields and types.
 *
 * @template T = unknown - Context
 * @param mappings - mapping from get mappings request
 * @returns an object of fields and types
 */
const flattenMappings = <T = unknown>(mappings: ApiResponse<IndicesGetMappingResponse, T>) => {
  const fields: Record<string, string> = {};
  Object.values(mappings.body).forEach((body) =>
    parseProperties(body.mappings.properties, undefined, fields)
  );
  return fields;
};

const parseProperties = (
  properties: Record<string, MappingProperty> | undefined,
  prefixes: string[] = [],
  fields: Record<string, string>
) => {
  Object.entries(properties || {}).forEach(([key, value]) => {
    if (value.properties) {
      parseProperties(value.properties, [...prefixes, key], fields);
    } else {
      fields[[...prefixes, key].join('.')] = value.type!;
    }
  });
  return fields;
};
