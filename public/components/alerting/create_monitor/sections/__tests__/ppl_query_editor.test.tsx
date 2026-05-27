/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression test for PplQueryEditor.
 *
 * The `data-test-subj="alertManagerPplQueryEditor"` anchor used to be passed
 * as a prop to `<CodeEditor>` from `osd-react/code_editor`. That wrapper
 * doesn't forward arbitrary DOM attributes, so the prop was silently dropped
 * and Cypress / functional selectors hit nothing. The fix moved the
 * data-test-subj onto the wrapper `<div>` so the anchor is queryable.
 */

import React from 'react';
import { render } from '@testing-library/react';

jest.mock('../../../../../../../../src/plugins/opensearch_dashboards_react/public', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const R = require('react');
  return {
    CodeEditor: function MockedCodeEditor() {
      return R.createElement('div', { 'data-mocked-code-editor': true });
    },
    OpenSearchDashboardsContextProvider: function MockedKbnCtx(props: { children: unknown }) {
      return R.createElement(R.Fragment, null, props.children);
    },
  };
});

jest.mock('@osd/monaco', () => ({
  monaco: {
    languages: {
      CompletionItemKind: { Keyword: 0, Function: 1, Field: 2 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 1 },
    },
    Range: function FakeRange(this: any, sl: number, sc: number, el: number, ec: number) {
      this.startLineNumber = sl;
      this.startColumn = sc;
      this.endLineNumber = el;
      this.endColumn = ec;
    },
  },
  PPLLang: { ID: 'ppl' },
}));

jest.mock('../../../hooks/use_index_mappings', () => ({
  useIndexMappings: () => ({
    fieldsByType: { keyword: [], date: [], number: [] },
    error: null,
  }),
}));

jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: { core: { uiSettings: {} } },
}));

import { PplQueryEditor } from '../ppl_query_editor';

describe('PplQueryEditor', () => {
  it('renders the alertManagerPplQueryEditor data-test-subj on a real DOM element', () => {
    // Regression: the anchor used to ride on <CodeEditor>'s prop list and was
    // silently discarded. Now it must be on the wrapping div so test selectors
    // resolve regardless of how CodeEditor handles its own props.
    const { container } = render(
      <PplQueryEditor
        dsId="ds-1"
        indices={['logs-*']}
        value="source = logs-*"
        onChange={() => {}}
      />
    );
    const anchor = container.querySelector('[data-test-subj="alertManagerPplQueryEditor"]');
    expect(anchor).not.toBeNull();
    expect(anchor!.tagName).toBe('DIV');
  });
});
