/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiResponse } from '@opensearch-project/opensearch/.';
import { IndicesGetMappingResponse } from '@opensearch-project/opensearch/api/types';
import { SearchResponse } from 'elasticsearch';
import { generateFieldContext } from '../generate_field_context';

describe('Generate field context', () => {
  it('handles empty mappings', () => {
    const fields = generateFieldContext(
      ({
        body: { employee_nested: { mappings: {} } },
      } as unknown) as ApiResponse<IndicesGetMappingResponse>,
      ({
        body: {
          took: 0,
          timed_out: false,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
          hits: { total: { value: 0, relation: 'gte' }, max_score: 1, hits: [] },
        },
      } as unknown) as ApiResponse<SearchResponse<unknown>>
    );
    expect(fields).toEqual('');
  });

  it('generates field context', () => {
    const fields = generateFieldContext(
      ({
        body: {
          employee_nested: {
            mappings: {
              properties: {
                comments: {
                  properties: {
                    date: { type: 'date' },
                    likes: { type: 'long' },
                    message: {
                      type: 'text',
                      fields: { keyword: { type: 'keyword', ignore_above: 256 } },
                    },
                  },
                },
                id: { type: 'long' },
                name: { type: 'keyword' },
                projects: {
                  properties: {
                    address: {
                      properties: { city: { type: 'keyword' }, state: { type: 'keyword' } },
                    },
                    name: { type: 'keyword' },
                    started_year: { type: 'long' },
                  },
                },
                title: { type: 'keyword' },
              },
            },
          },
        },
      } as unknown) as ApiResponse<IndicesGetMappingResponse>,
      ({
        body: {
          took: 0,
          timed_out: false,
          _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
          hits: {
            total: { value: 10000, relation: 'gte' },
            max_score: 1,
            hits: [
              {
                _index: 'employee_nested',
                _id: '-cIErYkBQjxNwHvKnmIS',
                _score: 1,
                _source: {
                  id: 4,
                  name: 'Susan Smith',
                  projects: [],
                  comments: [
                    { date: '2018-06-23', message: 'I love New york', likes: 56 },
                    { date: '2017-10-25', message: 'Today is good weather', likes: 22 },
                  ],
                },
              },
            ],
          },
        },
      } as unknown) as ApiResponse<SearchResponse<unknown>>
    );
    expect(fields).toEqual(
      '- comments.date: date (null)\n- comments.likes: long (null)\n- comments.message: text (null)\n- id: long (4)\n- name: keyword ("Susan Smith")\n- projects.address.city: keyword (null)\n- projects.address.state: keyword (null)\n- projects.name: keyword (null)\n- projects.started_year: long (null)\n- title: keyword (null)'
    );
  });
});
