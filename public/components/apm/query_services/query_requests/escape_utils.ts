/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Escaping helpers for user-controlled values interpolated into PromQL and PPL
 * queries. Prevents query breakage and injection from names containing regex
 * metacharacters, quotes, or PPL string delimiters.
 */

/** Escape a value for use inside a PromQL regex matcher (label=~"..."). */
export const escapePromQLRegex = (value: string): string =>
  value.replace(/[\\.+*?()[\]{}|^$"]/g, (ch) => `\\${ch}`);

/** Escape a value for use inside a PromQL exact-match label (label="..."). */
export const escapePromQLLabel = (value: string): string =>
  value.replace(/[\\"]/g, (ch) => `\\${ch}`);

/** Escape a value for use inside a single-quoted PPL string literal. */
export const escapePPLString = (value: string): string =>
  value.replace(/[\\']/g, (ch) => `\\${ch}`);
