/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PaginationCursorState,
  decodeCursor,
  encodeCursor,
  hashFilters,
} from '../slo_pagination_cursor';

const sample: PaginationCursorState = {
  v: 1,
  p: 3,
  ps: 25,
  sf: 'name',
  so: 'asc',
  fh: 'abc12345',
};

describe('slo_pagination_cursor', () => {
  it('round-trips a representative cursor', () => {
    const encoded = encodeCursor(sample);
    expect(decodeCursor(encoded)).toEqual(sample);
  });

  it('emits a URL-safe encoding (no +, /, or = padding)', () => {
    // Pad the filter-hash so a naive base64 encoder would emit '=' or '+/'.
    const encoded = encodeCursor({ ...sample, fh: '?>?>?>?>?>?>?>?>?>' });
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeCursor(encoded)?.fh).toBe('?>?>?>?>?>?>?>?>?>');
  });

  it('returns null for null/undefined/empty cursors', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('returns null for malformed base64url', () => {
    expect(decodeCursor('!!!not-base64!!!')).toBeNull();
  });

  it('returns null for non-JSON payload', () => {
    const encoded = Buffer.from('not json', 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(decodeCursor(encoded)).toBeNull();
  });

  it('rejects unknown cursor version', () => {
    const future = ({ ...sample, v: 2 } as unknown) as PaginationCursorState;
    const encoded = Buffer.from(JSON.stringify(future), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(decodeCursor(encoded)).toBeNull();
  });

  it('rejects non-integer page', () => {
    const bad = ({ ...sample, p: 1.5 } as unknown) as PaginationCursorState;
    const encoded = Buffer.from(JSON.stringify(bad), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(decodeCursor(encoded)).toBeNull();
  });

  it('rejects sortOrder outside asc/desc', () => {
    const bad = ({ ...sample, so: 'sideways' } as unknown) as PaginationCursorState;
    const encoded = Buffer.from(JSON.stringify(bad), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(decodeCursor(encoded)).toBeNull();
  });
});

describe('slo_pagination_cursor.hashFilters', () => {
  it('is stable for identical inputs', () => {
    expect(hashFilters({ state: ['a', 'b'], service: ['svc'] })).toBe(
      hashFilters({ state: ['a', 'b'], service: ['svc'] })
    );
  });

  it('is order-insensitive within an array value', () => {
    expect(hashFilters({ state: ['breached', 'warning'] })).toBe(
      hashFilters({ state: ['warning', 'breached'] })
    );
  });

  it('is order-insensitive in keys', () => {
    expect(hashFilters({ a: 1, b: 2 })).toBe(hashFilters({ b: 2, a: 1 }));
  });

  it('changes when a filter changes', () => {
    expect(hashFilters({ state: ['ok'] })).not.toBe(hashFilters({ state: ['breached'] }));
  });

  it('treats undefined and missing equivalently', () => {
    expect(hashFilters({ a: 1, b: undefined })).toBe(hashFilters({ a: 1 }));
  });
});
