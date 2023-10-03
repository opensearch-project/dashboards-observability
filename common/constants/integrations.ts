/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const OPENSEARCH_DOCUMENTATION_URL = 'https://opensearch.org/docs/latest/integrations/index';
export const ASSET_FILTER_OPTIONS = ['index-pattern', 'search', 'visualization', 'dashboard'];
export const VALID_INDEX_NAME = /^[a-z\d\.][a-z\d\._\-\*]*$/;

// Upstream doesn't export this, so we need to redeclare it for our use.
export type Color = 'success' | 'primary' | 'warning' | 'danger' | undefined;
