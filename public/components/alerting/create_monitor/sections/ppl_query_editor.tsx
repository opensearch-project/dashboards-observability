/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monaco-backed PPL editor for the Create / Edit flyout. Replaces the plain
 * `EuiTextArea` with:
 *   - PPL syntax highlighting via the `@osd/monaco` PPL contribution
 *     (registered automatically when this module is imported).
 *   - Lightweight autocomplete: PPL command keywords, common functions, and
 *     leaf field paths from the picked indices' `_mapping`.
 *
 * We deliberately avoid the data plugin's `getQuerySuggestions` because it
 * binds to the OSD index-pattern saved-object system, which alerting
 * datasources don't use. This editor's completion list is narrower but its
 * data model matches the rest of the alerting UI.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { monaco, PPLLang } from '@osd/monaco';
import {
  CodeEditor,
  OpenSearchDashboardsContextProvider,
} from '../../../../../../../src/plugins/opensearch_dashboards_react/public';
import { coreRefs } from '../../../../framework/core_refs';
import { useIndexMappings } from '../../hooks/use_index_mappings';

// PPL command keywords and common functions. Kept inline rather than imported
// from `@osd/monaco/ppl` because that module's exports are token sets meant
// for highlighting, not for offering as suggestions; this is the small
// surface that a user typing a fresh query actually wants to discover.
const PPL_COMMAND_KEYWORDS = [
  'source',
  'where',
  'fields',
  'stats',
  'eval',
  'sort',
  'head',
  'tail',
  'rename',
  'dedup',
  'top',
  'rare',
  'parse',
  'eventstats',
  'lookup',
  'join',
  'union',
  'subquery',
  'kmeans',
  'ad',
  'ml',
  'as',
  'by',
  'and',
  'or',
  'not',
  'in',
  'between',
  'like',
  'is',
  'null',
  'true',
  'false',
];

const PPL_AGG_FUNCTIONS = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'distinct_count',
  'percentile',
  'stddev_pop',
  'stddev_samp',
  'var_pop',
  'var_samp',
];

const PPL_SCALAR_FUNCTIONS = [
  'abs',
  'ceil',
  'floor',
  'round',
  'lower',
  'upper',
  'concat',
  'substring',
  'trim',
  'length',
  'now',
  'date_format',
  'date_add',
  'date_sub',
];

const LANGUAGE_CONFIGURATION: monaco.languages.LanguageConfiguration = {
  // PPL identifiers can include `.` (dotted field paths), `@` (`@timestamp`),
  // `-`, and `_`. Treating them as word characters means autocomplete picks
  // up the full field path under the cursor instead of stopping at `.`.
  wordPattern: /@?\w[\w@'.-]*/,
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
};

const EDITOR_OPTIONS: monaco.editor.IEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  lineNumbers: 'off',
  glyphMargin: false,
  folding: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  wrappingIndent: 'indent',
  automaticLayout: true,
  scrollbar: { alwaysConsumeMouseWheel: false },
  // Suggestions trigger on these characters in addition to manual Ctrl+Space.
  // Pipe `|` chains PPL commands, space follows command keywords, dot opens
  // nested field paths.
  suggest: { showWords: false },
};

export interface PplQueryEditorProps {
  /** Datasource id used to fetch field paths for autocomplete. */
  dsId: string;
  /** Indices currently picked in the IndexPicker. Drives field suggestions. */
  indices: string[];
  value: string;
  onChange: (value: string) => void;
  /** Visual height. Defaults to a comfortable 5-line area. */
  height?: number | string;
}

export const PplQueryEditor: React.FC<PplQueryEditorProps> = ({
  dsId,
  indices,
  value,
  onChange,
  height = 140,
}) => {
  const { fieldsByType, error: mappingsError } = useIndexMappings({ dsId, indices });

  // Flatten field paths once per mappings change. Keeping leaf type alongside
  // the path lets the suggestion list render `field — date` style detail.
  const fieldEntries = useMemo(() => {
    const out: Array<{ name: string; type: string }> = [];
    for (const [type, fields] of Object.entries(fieldsByType)) {
      for (const f of fields) out.push({ name: f, type });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [fieldsByType]);

  // Stable ref so the suggestion provider always sees the latest field list
  // without re-registering the provider on every keystroke.
  const fieldsRef = useRef(fieldEntries);
  fieldsRef.current = fieldEntries;

  const provideCompletionItems = useCallback(
    (
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): monaco.languages.CompletionList => {
      const wordInfo = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        wordInfo.startColumn,
        position.lineNumber,
        wordInfo.endColumn
      );

      const fieldSuggestions: monaco.languages.CompletionItem[] = fieldsRef.current.map((f) => ({
        label: f.name,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: f.name,
        detail: f.type,
        range,
        sortText: `0-${f.name}`,
      }));

      const keywordSuggestions: monaco.languages.CompletionItem[] = PPL_COMMAND_KEYWORDS.map(
        (k) => ({
          label: k,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: k,
          range,
          sortText: `1-${k}`,
        })
      );

      const aggSuggestions: monaco.languages.CompletionItem[] = PPL_AGG_FUNCTIONS.map((fn) => ({
        label: fn,
        kind: monaco.languages.CompletionItemKind.Function,
        // The `(${1})` snippet places the cursor inside the parens after pick.
        insertText: `${fn}($1)`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: 'aggregate',
        range,
        sortText: `2-${fn}`,
      }));

      const scalarSuggestions: monaco.languages.CompletionItem[] = PPL_SCALAR_FUNCTIONS.map(
        (fn) => ({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}($1)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'function',
          range,
          sortText: `3-${fn}`,
        })
      );

      return {
        suggestions: [
          ...fieldSuggestions,
          ...keywordSuggestions,
          ...aggSuggestions,
          ...scalarSuggestions,
        ],
        incomplete: false,
      };
    },
    []
  );

  const suggestionProvider: monaco.languages.CompletionItemProvider = useMemo(
    () => ({
      triggerCharacters: [' ', '|', '.', '='],
      provideCompletionItems,
    }),
    [provideCompletionItems]
  );

  // Ensure `editorDidMount` is stable so the harness doesn't tear down /
  // re-create the editor each render. Re-attach focus listeners only.
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const editorDidMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  }, []);

  useEffect(() => {
    return () => {
      editorRef.current = null;
    };
  }, []);

  // The shared `CodeEditor` calls `useUiSetting('theme:darkMode')` internally,
  // which throws if rendered outside an `OpenSearchDashboardsContextProvider`.
  // The Alert Manager flyout isn't currently wrapped in one, so we provide a
  // local context with the bare minimum (uiSettings) sourced from `coreRefs`.
  const services = useMemo(() => ({ uiSettings: coreRefs.core?.uiSettings }), []);

  return (
    <OpenSearchDashboardsContextProvider services={services}>
      {/* `CodeEditor` (osd-react/code_editor) is a typed wrapper that doesn't
          forward arbitrary DOM attributes, so a `data-test-subj` prop on it is
          silently dropped. Anchor the test-subj on the wrapper div instead so
          Cypress / functional tests have a stable selector. */}
      <div
        data-test-subj="alertManagerPplQueryEditor"
        style={{ border: '1px solid var(--euiColorLightShade)', borderRadius: 4 }}
      >
        <CodeEditor
          languageId={PPLLang.ID}
          value={value}
          onChange={onChange}
          height={height}
          suggestionProvider={suggestionProvider}
          languageConfiguration={LANGUAGE_CONFIGURATION}
          options={EDITOR_OPTIONS}
          editorDidMount={editorDidMount}
        />
      </div>
      {mappingsError && (
        <EuiText color="danger" size="xs" data-test-subj="alertManagerPplQueryEditorMappingsError">
          {i18n.translate('observability.alerting.pplQueryEditor.mappingsErrorMessage', {
            defaultMessage: 'Could not load field suggestions for the selected indices: {message}',
            values: { message: mappingsError.message },
          })}
        </EuiText>
      )}
    </OpenSearchDashboardsContextProvider>
  );
};
