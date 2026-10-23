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
import { act, render } from '@testing-library/react';

jest.mock('../../../../../../../../src/plugins/opensearch_dashboards_react/public', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const R = require('react');
  return {
    // Records the height it is given and, when a test installs a fake Monaco
    // editor, hands it to editorDidMount like the real CodeEditor does.
    CodeEditor: function MockedCodeEditor(props: {
      height: number;
      editorDidMount?: (editor: unknown) => void;
    }) {
      R.useEffect(() => {
        const fake = (global as any).__mockMonacoEditor;
        if (fake && props.editorDidMount) props.editorDidMount(fake);
      }, []);
      return R.createElement('div', {
        'data-mocked-code-editor': true,
        'data-height': String(props.height),
      });
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

  describe('auto-expand', () => {
    let sizeListener: ((e: { contentHeight: number }) => void) | undefined;
    const installEditor = (contentHeight: number) => {
      (global as any).__mockMonacoEditor = {
        getContentHeight: () => contentHeight,
        onDidContentSizeChange: (cb: (e: { contentHeight: number }) => void) => {
          sizeListener = cb;
        },
      };
    };
    const renderedHeight = (container: HTMLElement) =>
      Number(container.querySelector('[data-mocked-code-editor]')!.getAttribute('data-height'));
    const renderEditor = (props: { height?: number; maxHeight?: number } = {}) =>
      render(<PplQueryEditor dsId="ds-1" indices={[]} value="q" onChange={() => {}} {...props} />);

    afterEach(() => {
      delete (global as any).__mockMonacoEditor;
      sizeListener = undefined;
    });

    it('keeps the default minimum height for short content', () => {
      installEditor(40);
      const { container } = renderEditor();
      expect(renderedHeight(container)).toBe(140);
    });

    it('grows to fit taller content', () => {
      installEditor(300);
      const { container } = renderEditor();
      expect(renderedHeight(container)).toBe(300);
    });

    it('caps at maxHeight (480 by default) so very large queries scroll', () => {
      installEditor(5000);
      const { container } = renderEditor();
      expect(renderedHeight(container)).toBe(480);
    });

    it('follows content size changes as the user types or pastes', () => {
      installEditor(40);
      const { container } = renderEditor();
      act(() => sizeListener!({ contentHeight: 260 }));
      expect(renderedHeight(container)).toBe(260);
      act(() => sizeListener!({ contentHeight: 9999 }));
      expect(renderedHeight(container)).toBe(480);
      act(() => sizeListener!({ contentHeight: 10 }));
      expect(renderedHeight(container)).toBe(140);
    });

    it('honours custom height / maxHeight props', () => {
      installEditor(1000);
      const { container } = renderEditor({ height: 200, maxHeight: 600 });
      expect(renderedHeight(container)).toBe(600);
    });
  });
});
