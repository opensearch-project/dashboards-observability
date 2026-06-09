/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monaco-backed PromQL editor for the Create / Edit metrics rule flyout.
 * Provides:
 *   - PromQL keyword/function/metric autocomplete via Monaco IntelliSense
 *   - Live metric names fetched from the Prometheus datasource
 *   - Syntax highlighting for PromQL
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { monaco } from '@osd/monaco';
import {
  CodeEditor,
  OpenSearchDashboardsContextProvider,
} from '../../../../../../src/plugins/opensearch_dashboards_react/public';
import { coreRefs } from '../../../framework/core_refs';
import { AlertingPromResourcesService } from './query_services/alerting_prom_resources_service';

// PromQL language ID
const PROMQL_LANG_ID = 'promql';

// PromQL keywords
const PROMQL_KEYWORDS = [
  'by', 'without', 'on', 'ignoring', 'group_left', 'group_right',
  'bool', 'and', 'or', 'unless', 'offset',
];

// PromQL aggregation operators
const PROMQL_AGGREGATIONS = [
  'sum', 'min', 'max', 'avg', 'count', 'count_values',
  'stddev', 'stdvar', 'topk', 'bottomk', 'quantile',
  'group',
];

// PromQL functions
const PROMQL_FUNCTIONS: Array<{ name: string; detail: string }> = [
  { name: 'rate', detail: 'rate(v range-vector)' },
  { name: 'irate', detail: 'irate(v range-vector)' },
  { name: 'increase', detail: 'increase(v range-vector)' },
  { name: 'delta', detail: 'delta(v range-vector)' },
  { name: 'idelta', detail: 'idelta(v range-vector)' },
  { name: 'histogram_quantile', detail: 'histogram_quantile(φ float, b instant-vector)' },
  { name: 'abs', detail: 'abs(v instant-vector)' },
  { name: 'absent', detail: 'absent(v instant-vector)' },
  { name: 'ceil', detail: 'ceil(v instant-vector)' },
  { name: 'floor', detail: 'floor(v instant-vector)' },
  { name: 'round', detail: 'round(v instant-vector, to_nearest scalar)' },
  { name: 'clamp', detail: 'clamp(v instant-vector, min scalar, max scalar)' },
  { name: 'clamp_min', detail: 'clamp_min(v instant-vector, min scalar)' },
  { name: 'clamp_max', detail: 'clamp_max(v instant-vector, max scalar)' },
  { name: 'changes', detail: 'changes(v range-vector)' },
  { name: 'deriv', detail: 'deriv(v range-vector)' },
  { name: 'exp', detail: 'exp(v instant-vector)' },
  { name: 'ln', detail: 'ln(v instant-vector)' },
  { name: 'log2', detail: 'log2(v instant-vector)' },
  { name: 'log10', detail: 'log10(v instant-vector)' },
  { name: 'sqrt', detail: 'sqrt(v instant-vector)' },
  { name: 'label_replace', detail: 'label_replace(v, dst, repl, src, regex)' },
  { name: 'label_join', detail: 'label_join(v, dst, sep, src...)' },
  { name: 'sort', detail: 'sort(v instant-vector)' },
  { name: 'sort_desc', detail: 'sort_desc(v instant-vector)' },
  { name: 'time', detail: 'time() — current Unix timestamp' },
  { name: 'vector', detail: 'vector(s scalar)' },
  { name: 'scalar', detail: 'scalar(v instant-vector)' },
  { name: 'predict_linear', detail: 'predict_linear(v range-vector, t scalar)' },
  { name: 'resets', detail: 'resets(v range-vector)' },
  { name: 'avg_over_time', detail: 'avg_over_time(v range-vector)' },
  { name: 'min_over_time', detail: 'min_over_time(v range-vector)' },
  { name: 'max_over_time', detail: 'max_over_time(v range-vector)' },
  { name: 'sum_over_time', detail: 'sum_over_time(v range-vector)' },
  { name: 'count_over_time', detail: 'count_over_time(v range-vector)' },
  { name: 'last_over_time', detail: 'last_over_time(v range-vector)' },
];

const LANGUAGE_CONFIGURATION: monaco.languages.LanguageConfiguration = {
  wordPattern: /[a-zA-Z_:][a-zA-Z0-9_:]*/,
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  brackets: [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ],
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
  suggest: { showWords: false },
};

// Register PromQL language once
let languageRegistered = false;
function ensurePromQLRegistered() {
  if (languageRegistered) return;
  languageRegistered = true;
  monaco.languages.register({ id: PROMQL_LANG_ID });
  monaco.languages.setLanguageConfiguration(PROMQL_LANG_ID, LANGUAGE_CONFIGURATION);
  monaco.languages.setMonarchTokensProvider(PROMQL_LANG_ID, {
    keywords: PROMQL_KEYWORDS,
    aggregations: PROMQL_AGGREGATIONS,
    functions: PROMQL_FUNCTIONS.map((f) => f.name),
    tokenizer: {
      root: [
        [/\d+(\.\d+)?([eE][+-]?\d+)?[smhdwy]?/, 'number'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/#.*$/, 'comment'],
        [
          /[a-zA-Z_:][a-zA-Z0-9_:]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@aggregations': 'keyword',
              '@functions': 'predefined',
              '@default': 'identifier',
            },
          },
        ],
        [/[{}()\[\]]/, 'delimiter.bracket'],
        [/[><=!]=?|[+\-*/%^]/, 'operator'],
      ],
    },
  });
}

export interface PromQLMonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
  datasourceId?: string;
}

export const PromQLMonacoEditor: React.FC<PromQLMonacoEditorProps> = ({
  value,
  onChange,
  height = 80,
  datasourceId,
}) => {
  const metricsRef = useRef<string[]>([]);
  const labelsRef = useRef<string[]>([]);

  // Fetch live metrics for autocomplete
  useEffect(() => {
    if (!datasourceId) return;
    let cancelled = false;
    (async () => {
      try {
        const svc = new AlertingPromResourcesService(datasourceId);
        const { metrics } = await svc.listMetricNames();
        if (!cancelled) metricsRef.current = metrics;
      } catch {
        // Non-critical
      }
    })();
    return () => { cancelled = true; };
  }, [datasourceId]);

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

      const suggestions: monaco.languages.CompletionItem[] = [];

      // Metric names (highest priority)
      for (const m of metricsRef.current) {
        suggestions.push({
          label: m,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: m,
          detail: 'metric',
          range,
          sortText: `0-${m}`,
        });
      }

      // Functions
      for (const f of PROMQL_FUNCTIONS) {
        suggestions.push({
          label: f.name,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${f.name}(`,
          detail: f.detail,
          range,
          sortText: `1-${f.name}`,
        });
      }

      // Aggregations
      for (const a of PROMQL_AGGREGATIONS) {
        suggestions.push({
          label: a,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: `${a}(`,
          detail: 'aggregation',
          range,
          sortText: `2-${a}`,
        });
      }

      // Keywords
      for (const k of PROMQL_KEYWORDS) {
        suggestions.push({
          label: k,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: k,
          detail: 'keyword',
          range,
          sortText: `3-${k}`,
        });
      }

      return { suggestions };
    },
    []
  );

  // Register language and completion provider
  const disposableRef = useRef<monaco.IDisposable | null>(null);
  useEffect(() => {
    ensurePromQLRegistered();
    disposableRef.current = monaco.languages.registerCompletionItemProvider(
      PROMQL_LANG_ID,
      {
        triggerCharacters: ['(', '{', ' ', ','],
        provideCompletionItems,
      }
    );
    return () => {
      disposableRef.current?.dispose();
    };
  }, [provideCompletionItems]);

  const services = useMemo(() => ({ uiSettings: coreRefs.uiSettings! }), []);

  return (
    <OpenSearchDashboardsContextProvider services={services}>
      <CodeEditor
        languageId={PROMQL_LANG_ID}
        value={value}
        onChange={onChange}
        height={typeof height === 'number' ? `${height}px` : height}
        options={EDITOR_OPTIONS}
      />
    </OpenSearchDashboardsContextProvider>
  );
};
