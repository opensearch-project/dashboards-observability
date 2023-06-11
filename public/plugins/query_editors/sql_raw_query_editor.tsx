/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MonacoRawQueryEditor } from './monaco_raw_query_editor';

export const SQLRawQueryEditor = React.memo(({ query, onQueryChange }) => {
  return <MonacoRawQueryEditor value={''} onChange={onQueryChange} theme="" />;
});
