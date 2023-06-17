/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiSpacer } from '@elastic/eui';
import { MonacoRawQueryEditor } from '../monaco_raw_query_editor';
import { QueryHeader } from '../query_header';

export const SqlRawQueryEditor = (props) => {
  return (
    <>
      <MonacoRawQueryEditor width="100%" height={500} value={''} onChange={props.onEditorChange} />
    </>
  );
};
