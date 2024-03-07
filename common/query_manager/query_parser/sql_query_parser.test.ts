/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getGroupBy } from './sql_query_parser';

describe('sql parser', () => {
  it('parses a single field', async () => {
    const results = getGroupBy('select count(*), field from index group by field');
    expect(results).toMatchInlineSnapshot(`
      Object {
        "aggregations": Array [
          Object {
            "function": Object {
              "name": "count",
              "percentile_agg_function": "",
              "value_expression": "*",
            },
            "function_alias": "",
          },
        ],
        "groupby": Object {
          "group_fields": Array [
            Object {
              "name": "field",
            },
          ],
          "span": null,
        },
      }
    `);
  });

  it('removes backticks', async () => {
    const results = getGroupBy('select count(*), `field` from index group by `field`');
    expect(results).toMatchInlineSnapshot(`
      Object {
        "aggregations": Array [
          Object {
            "function": Object {
              "name": "count",
              "percentile_agg_function": "",
              "value_expression": "*",
            },
            "function_alias": "",
          },
        ],
        "groupby": Object {
          "group_fields": Array [
            Object {
              "name": "field",
            },
          ],
          "span": null,
        },
      }
    `);
  });

  it('parses multiple fields', async () => {
    const results = getGroupBy(
      'select a, count(*) as b, avg(c) as d from index where 1 = 1 group by span(a, 1d) as e, f, g limit 10'
    );
    expect(results).toMatchInlineSnapshot(`
      Object {
        "aggregations": Array [
          Object {
            "function": Object {
              "name": "count",
              "percentile_agg_function": "",
              "value_expression": "*",
            },
            "function_alias": "b",
          },
          Object {
            "function": Object {
              "name": "avg",
              "percentile_agg_function": "",
              "value_expression": "c",
            },
            "function_alias": "d",
          },
        ],
        "groupby": Object {
          "group_fields": Array [
            Object {
              "name": "f",
            },
            Object {
              "name": "g",
            },
          ],
          "span": Object {
            "customLabel": "e",
            "span_expression": Object {
              "field": "a",
              "literal_value": "1",
              "time_unit": "d",
              "type": "",
            },
          },
        },
      }
    `);
  });
});
