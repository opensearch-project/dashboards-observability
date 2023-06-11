/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This component should include functionalities related to Monaco specifically,
 * for example adding lazy loading, error handings and other enhancements or overriding
 * features.
 */

import React from 'react';
import MonacoEditor, { MonacoEditorProps } from 'react-monaco-editor';

export const MonacoRawQueryEditor = React.memo((props: MonacoEditorProps) => {
  return <MonacoEditor {...props} />;
});
