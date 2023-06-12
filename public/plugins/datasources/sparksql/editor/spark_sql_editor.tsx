/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiSpacer } from '@elastic/eui';
import {
  SqlRawQueryEditor,
  SqlVisualBuilder,
  QueryHeader,
} from '../../../../plugins/query_editors';

export const SparkSqlQueryEditor = ({ datasource, query }) => {
  return (
    <>
      <QueryHeader />

      {query.editorMode !== 'query_editor' && <SqlVisualBuilder />}

      <EuiSpacer size="s" />

      {query.editorMode === 'query_editor' && <SqlRawQueryEditor onEditorChange={() => {}} />}
    </>
  );
};
