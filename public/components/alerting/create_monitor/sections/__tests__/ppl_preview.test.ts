/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  extractWhereFieldNames,
  orderSchemaForPreview,
  PplPreviewSchemaField,
} from '../ppl_preview';

const f = (name: string, type: string): PplPreviewSchemaField => ({ name, type });

describe('orderSchemaForPreview', () => {
  it('pins headline fields to the front in the canonical headline order', () => {
    const schema = [
      f('attributes.foo', 'string'),
      f('severityText', 'string'),
      f('time', 'timestamp'),
      f('body', 'string'),
    ];

    const ordered = orderSchemaForPreview(schema);
    // `time` is listed earliest in HEADLINE_FIELD_NAMES, then `body`,
    // then `severityText`. Anything outside the headline list trails.
    expect(ordered.map((x) => x.name)).toEqual(['time', 'body', 'severityText', 'attributes.foo']);
  });

  it('orders scalar columns above complex (struct/object) columns', () => {
    const schema = [
      f('container', 'struct'),
      f('host', 'string'),
      f('payload', 'object'),
      f('count', 'long'),
    ];

    const ordered = orderSchemaForPreview(schema);
    // Within scalar band, declaration order is the tiebreaker — `host` first
    // because it appears earlier than `count` in the input. Both scalars
    // beat the structs.
    expect(ordered.map((x) => x.name)).toEqual(['host', 'count', 'container', 'payload']);
  });

  it('promotes fields referenced in a where clause directly after headlines', () => {
    const schema = [
      f('time', 'timestamp'),
      f('body', 'string'),
      f('user_id', 'string'),
      f('region', 'string'),
    ];

    const ordered = orderSchemaForPreview(
      schema,
      'source = logs | where user_id = "u-1" and region = "us-east-1"'
    );
    // headline `time`/`body` first, then the two where-referenced columns
    // (declaration order preserved within the where band), then nothing else.
    expect(ordered.map((x) => x.name)).toEqual(['time', 'body', 'user_id', 'region']);
  });

  it('drops additional members of the timestamp family beyond the first', () => {
    const schema = [
      f('time', 'timestamp'),
      f('@timestamp', 'timestamp'),
      f('timestamp', 'timestamp'),
      f('body', 'string'),
    ];

    const ordered = orderSchemaForPreview(schema);
    // Only the first timestamp survives; the rest are folded into the
    // hidden-columns count by the panel renderer.
    expect(ordered.map((x) => x.name)).toEqual(['time', 'body']);
  });

  it('returns a new array — does not mutate the input', () => {
    const schema = [f('struct_field', 'struct'), f('scalar_field', 'string')];
    const original = [...schema];
    orderSchemaForPreview(schema);
    expect(schema).toEqual(original);
  });

  it('tolerates an empty schema', () => {
    expect(orderSchemaForPreview([])).toEqual([]);
  });

  it('does not promote where-referenced fields that are not in the schema', () => {
    // Real-world case: query references `attributes.otelTraceID` but the
    // cluster maps that path to a flat `traceId` column. The resolver
    // shouldn't invent a column or otherwise bridge the names.
    const schema = [f('time', 'timestamp'), f('traceId', 'string'), f('body', 'string')];

    const ordered = orderSchemaForPreview(
      schema,
      "source = logs | where attributes.otelTraceID = 'abc'"
    );
    // headline order applies: time, body, traceId.
    expect(ordered.map((x) => x.name)).toEqual(['time', 'body', 'traceId']);
  });
});

describe('extractWhereFieldNames', () => {
  it('returns [] for an empty query', () => {
    expect(extractWhereFieldNames('')).toEqual([]);
    expect(extractWhereFieldNames('source = foo')).toEqual([]);
  });

  it('extracts a single field reference', () => {
    expect(extractWhereFieldNames('source = logs | where status = 500')).toEqual(['status']);
  });

  it('extracts multiple fields chained with AND/OR', () => {
    const out = extractWhereFieldNames(
      "source = logs | where status = 500 AND user_id = 'u-1' OR severity != 'info'"
    );
    expect(out).toEqual(expect.arrayContaining(['status', 'user_id', 'severity']));
    // operator/keyword tokens shouldn't leak in.
    expect(out).not.toEqual(expect.arrayContaining(['AND', 'OR', 'NOT']));
  });

  it('handles backticked identifiers', () => {
    expect(extractWhereFieldNames('source = logs | where `severityText` = "ERROR"')).toEqual(
      expect.arrayContaining(['severityText'])
    );
  });

  it('handles dotted field paths', () => {
    // The dotted path is captured. The helper is best-effort — it may
    // include unquoted-looking tokens from the RHS too (e.g. simple words
    // inside string literals), but consumers tolerate spurious entries:
    // schema lookup just no-ops on names that don't exist.
    expect(extractWhereFieldNames("source = logs | where attributes.otelTraceID = 'abc'")).toEqual(
      expect.arrayContaining(['attributes.otelTraceID'])
    );
  });

  it('skips function names like now()', () => {
    const out = extractWhereFieldNames('source = logs | where time > now() - 1h');
    expect(out).toEqual(expect.arrayContaining(['time']));
    expect(out).not.toEqual(expect.arrayContaining(['now']));
  });

  it('extracts from multiple where segments', () => {
    const out = extractWhereFieldNames(
      'source = logs | where status = 500 | stats count() | where region = "us-east-1"'
    );
    expect(out).toEqual(expect.arrayContaining(['status', 'region']));
  });

  it('skips boolean / null literals on either side', () => {
    const out = extractWhereFieldNames(
      'source = logs | where active = true and tombstone = false and other is null'
    );
    expect(out).toEqual(expect.arrayContaining(['active', 'tombstone', 'other']));
    expect(out).not.toEqual(expect.arrayContaining(['true', 'false', 'null']));
  });
});
