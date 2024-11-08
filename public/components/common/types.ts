/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FieldCapAttributes {
  type: string;
  searchable: boolean;
  aggregatable: boolean;
}

export interface FieldCapResponse {
  indices: string[];
  fields: Record<string, Record<string, FieldCapAttributes>>;
}
