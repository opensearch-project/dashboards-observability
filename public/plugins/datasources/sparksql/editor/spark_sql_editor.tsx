/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiIcon, EuiSpacer } from '@elastic/eui';
import {
  SqlRawQueryEditor,
  SqlVisualBuilder,
  QueryHeader,
} from '../../../../plugins/query_editors';

const ROW_OPTIONS = [
  {
    value: 'host',
    inputDisplay: (
      <>
        <EuiIcon type="string" />
        host
      </>
    ),
    'data-test-subj': 'option-host',
    disabled: false,
  },
  {
    value: 'tags',
    inputDisplay: (
      <>
        <EuiIcon type="string" />
        tags
      </>
    ),
    'data-test-subj': 'option-tags',
    disabled: false,
  },
];

export const SparkSqlQueryEditor = ({ datasource, query }) => {
  return (
    <>
      <QueryHeader />

      {query.editorMode !== 'query_editor' && <SqlVisualBuilder options={ROW_OPTIONS} />}

      <EuiSpacer size="s" />

      {query.editorMode === 'query_editor' && <SqlRawQueryEditor onEditorChange={() => {}} />}
    </>
  );
};
