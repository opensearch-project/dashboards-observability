/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromQL Editor — syntax highlighting, autocomplete, validation,
 * function hints, prettify, and error highlighting.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiToolTip,
  EuiText,
  EuiIcon,
  EuiBadge,
  EuiPanel,
} from '@elastic/eui';
import {
  validatePromQL as coreValidatePromQL,
  prettifyPromQL as corePrettifyPromQL,
} from '../../../common/services/alerting/promql_validator';

// ============================================================================
// PromQL Language Data
// ============================================================================

export const PROMQL_FUNCTIONS: Record<string, { sig: string; desc: string; params: string[] }> = {
  rate: {
    sig: 'rate(v range-vector)',
    desc: 'Per-second average rate of increase over time range',
    params: ['range-vector'],
  },
  irate: {
    sig: 'irate(v range-vector)',
    desc: 'Per-second instant rate of increase',
    params: ['range-vector'],
  },
  increase: {
    sig: 'increase(v range-vector)',
    desc: 'Total increase over time range',
    params: ['range-vector'],
  },
  sum: {
    sig: 'sum(v instant-vector) by (label...)',
    desc: 'Sum of all values',
    params: ['instant-vector'],
  },
  avg: {
    sig: 'avg(v instant-vector) by (label...)',
    desc: 'Average of all values',
    params: ['instant-vector'],
  },
  min: { sig: 'min(v instant-vector)', desc: 'Minimum value', params: ['instant-vector'] },
  max: { sig: 'max(v instant-vector)', desc: 'Maximum value', params: ['instant-vector'] },
  count: { sig: 'count(v instant-vector)', desc: 'Count of elements', params: ['instant-vector'] },
  stddev: {
    sig: 'stddev(v instant-vector)',
    desc: 'Standard deviation',
    params: ['instant-vector'],
  },
  topk: {
    sig: 'topk(k scalar, v instant-vector)',
    desc: 'Top k elements by value',
    params: ['scalar', 'instant-vector'],
  },
  bottomk: {
    sig: 'bottomk(k scalar, v instant-vector)',
    desc: 'Bottom k elements by value',
    params: ['scalar', 'instant-vector'],
  },
  histogram_quantile: {
    sig: 'histogram_quantile(φ float, b instant-vector)',
    desc: 'Quantile from histogram buckets',
    params: ['float (0-1)', 'instant-vector'],
  },
  label_replace: {
    sig: 'label_replace(v, dst, replacement, src, regex)',
    desc: 'Replace label values using regex',
    params: ['instant-vector', 'dst_label', 'replacement', 'src_label', 'regex'],
  },
  label_join: {
    sig: 'label_join(v, dst, sep, src...)',
    desc: 'Join label values',
    params: ['instant-vector', 'dst_label', 'separator', 'src_labels...'],
  },
  abs: { sig: 'abs(v instant-vector)', desc: 'Absolute value', params: ['instant-vector'] },
  ceil: {
    sig: 'ceil(v instant-vector)',
    desc: 'Round up to nearest integer',
    params: ['instant-vector'],
  },
  floor: {
    sig: 'floor(v instant-vector)',
    desc: 'Round down to nearest integer',
    params: ['instant-vector'],
  },
  round: {
    sig: 'round(v instant-vector, to_nearest scalar)',
    desc: 'Round to nearest multiple',
    params: ['instant-vector', 'to_nearest'],
  },
  clamp: {
    sig: 'clamp(v instant-vector, min scalar, max scalar)',
    desc: 'Clamp values between min and max',
    params: ['instant-vector', 'min', 'max'],
  },
  clamp_min: {
    sig: 'clamp_min(v instant-vector, min scalar)',
    desc: 'Clamp to minimum value',
    params: ['instant-vector', 'min'],
  },
  clamp_max: {
    sig: 'clamp_max(v instant-vector, max scalar)',
    desc: 'Clamp to maximum value',
    params: ['instant-vector', 'max'],
  },
  delta: {
    sig: 'delta(v range-vector)',
    desc: 'Difference between first and last value',
    params: ['range-vector'],
  },
  deriv: {
    sig: 'deriv(v range-vector)',
    desc: 'Per-second derivative using linear regression',
    params: ['range-vector'],
  },
  predict_linear: {
    sig: 'predict_linear(v range-vector, t scalar)',
    desc: 'Predict value t seconds from now',
    params: ['range-vector', 'seconds'],
  },
  changes: {
    sig: 'changes(v range-vector)',
    desc: 'Number of times value changed',
    params: ['range-vector'],
  },
  resets: {
    sig: 'resets(v range-vector)',
    desc: 'Number of counter resets',
    params: ['range-vector'],
  },
  absent: {
    sig: 'absent(v instant-vector)',
    desc: 'Returns 1 if vector is empty',
    params: ['instant-vector'],
  },
  absent_over_time: {
    sig: 'absent_over_time(v range-vector)',
    desc: 'Returns 1 if range vector is empty',
    params: ['range-vector'],
  },
  sort: {
    sig: 'sort(v instant-vector)',
    desc: 'Sort by value ascending',
    params: ['instant-vector'],
  },
  sort_desc: {
    sig: 'sort_desc(v instant-vector)',
    desc: 'Sort by value descending',
    params: ['instant-vector'],
  },
  time: { sig: 'time()', desc: 'Current Unix timestamp', params: [] },
  vector: { sig: 'vector(s scalar)', desc: 'Convert scalar to vector', params: ['scalar'] },
  scalar: {
    sig: 'scalar(v instant-vector)',
    desc: 'Convert single-element vector to scalar',
    params: ['instant-vector'],
  },
  avg_over_time: {
    sig: 'avg_over_time(v range-vector)',
    desc: 'Average over time',
    params: ['range-vector'],
  },
  min_over_time: {
    sig: 'min_over_time(v range-vector)',
    desc: 'Minimum over time',
    params: ['range-vector'],
  },
  max_over_time: {
    sig: 'max_over_time(v range-vector)',
    desc: 'Maximum over time',
    params: ['range-vector'],
  },
  sum_over_time: {
    sig: 'sum_over_time(v range-vector)',
    desc: 'Sum over time',
    params: ['range-vector'],
  },
  count_over_time: {
    sig: 'count_over_time(v range-vector)',
    desc: 'Count over time',
    params: ['range-vector'],
  },
  quantile_over_time: {
    sig: 'quantile_over_time(φ, v range-vector)',
    desc: 'Quantile over time',
    params: ['float (0-1)', 'range-vector'],
  },
  last_over_time: {
    sig: 'last_over_time(v range-vector)',
    desc: 'Last value over time',
    params: ['range-vector'],
  },
};

const PROMQL_KEYWORDS = [
  'by',
  'without',
  'on',
  'ignoring',
  'group_left',
  'group_right',
  'bool',
  'offset',
  'and',
  'or',
  'unless',
];
// Empty until metadata service (T0-8) provides live data; autocomplete degrades gracefully.
export const MOCK_METRICS: string[] = [];
export const MOCK_LABEL_NAMES: string[] = [];
export const MOCK_LABEL_VALUES: Record<string, string[]> = {};

// ============================================================================
// Syntax Highlighting
// ============================================================================

interface Token {
  text: string;
  type:
    | 'function'
    | 'metric'
    | 'label'
    | 'string'
    | 'number'
    | 'operator'
    | 'keyword'
    | 'bracket'
    | 'duration'
    | 'error'
    | 'plain';
}

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < query.length) {
    // Whitespace
    if (/\s/.test(query[i])) {
      const start = i;
      while (i < query.length && /\s/.test(query[i])) i++;
      tokens.push({ text: query.slice(start, i), type: 'plain' });
      continue;
    }
    // Strings
    if (query[i] === '"' || query[i] === "'") {
      const quote = query[i];
      const start = i;
      i++;
      while (i < query.length && query[i] !== quote) {
        if (query[i] === '\\') i++;
        i++;
      }
      if (i < query.length) i++;
      tokens.push({ text: query.slice(start, i), type: 'string' });
      continue;
    }
    // Numbers (including durations like 5m, 1h, 30s)
    if (/\d/.test(query[i])) {
      const start = i;
      while (i < query.length && /[\d.]/.test(query[i])) i++;
      if (i < query.length && /[smhdwy]/.test(query[i])) {
        i++;
        tokens.push({ text: query.slice(start, i), type: 'duration' });
      } else {
        tokens.push({ text: query.slice(start, i), type: 'number' });
      }
      continue;
    }
    // Brackets
    if ('()[]{}'.includes(query[i])) {
      tokens.push({ text: query[i], type: 'bracket' });
      i++;
      continue;
    }
    // Operators
    if ('+-*/%^'.includes(query[i])) {
      tokens.push({ text: query[i], type: 'operator' });
      i++;
      continue;
    }
    // Comparison operators
    if ('=!><'.includes(query[i])) {
      const start = i;
      i++;
      if (i < query.length && '=~'.includes(query[i])) i++;
      tokens.push({ text: query.slice(start, i), type: 'operator' });
      continue;
    }
    // Comma
    if (query[i] === ',') {
      tokens.push({ text: ',', type: 'plain' });
      i++;
      continue;
    }
    // Identifiers (functions, metrics, keywords, labels)
    if (/[a-zA-Z_:]/.test(query[i])) {
      const start = i;
      while (i < query.length && /[a-zA-Z0-9_:]/.test(query[i])) i++;
      const word = query.slice(start, i);
      if (PROMQL_FUNCTIONS[word]) tokens.push({ text: word, type: 'function' });
      else if (PROMQL_KEYWORDS.includes(word)) tokens.push({ text: word, type: 'keyword' });
      else if (MOCK_METRICS.includes(word)) tokens.push({ text: word, type: 'metric' });
      else if (MOCK_LABEL_NAMES.includes(word)) tokens.push({ text: word, type: 'label' });
      else tokens.push({ text: word, type: 'plain' });
      continue;
    }
    // Anything else
    tokens.push({ text: query[i], type: 'plain' });
    i++;
  }
  return tokens;
}

const TOKEN_COLORS: Record<string, string> = {
  function: '#006BB4',
  metric: '#017D73',
  label: '#BD271E',
  string: '#98A2B3',
  number: '#F5A700',
  operator: '#920000',
  keyword: '#9170B8',
  bracket: '#69707D',
  duration: '#F5A700',
  error: '#BD271E',
  plain: '#343741',
};

function renderHighlighted(query: string): React.ReactNode {
  const tokens = tokenize(query);
  return tokens.map((t, i) => (
    <span key={i} style={{ color: TOKEN_COLORS[t.type] || '#343741' }}>
      {t.text}
    </span>
  ));
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationError {
  message: string;
  severity: 'error' | 'warning' | 'info';
  position?: number;
}

export function validatePromQL(query: string): ValidationError[] {
  const result = coreValidatePromQL(query);
  const errors: ValidationError[] = [];
  for (const e of result.errors) {
    errors.push({ message: e.message, severity: e.severity, position: e.position });
  }
  for (const w of result.warnings) {
    errors.push({ message: w.message, severity: w.severity, position: w.position });
  }
  return errors;
}

// ============================================================================
// Prettify
// ============================================================================

function prettifyPromQL(query: string): string {
  return corePrettifyPromQL(query);
}

// ============================================================================
// Autocomplete Engine
// ============================================================================

interface Suggestion {
  text: string;
  type: 'function' | 'metric' | 'label' | 'labelValue' | 'keyword' | 'snippet';
  detail?: string;
  insertText?: string;
}

function getContext(
  query: string,
  cursorPos: number
): {
  type: 'metric' | 'function' | 'label' | 'labelValue' | 'keyword' | 'general';
  prefix: string;
  labelName?: string;
} {
  const before = query.slice(0, cursorPos);
  // Inside label value: {label="...
  const labelValueMatch = before.match(/\{[^}]*?(\w+)\s*=~?\s*"([^"]*)$/);
  if (labelValueMatch) {
    return { type: 'labelValue', prefix: labelValueMatch[2], labelName: labelValueMatch[1] };
  }
  // Inside label matcher: {label...
  const labelMatch = before.match(/\{[^}]*?(\w*)$/);
  if (labelMatch) {
    return { type: 'label', prefix: labelMatch[1] };
  }
  // After by/without (
  const byMatch = before.match(/\b(?:by|without)\s*\(\s*(\w*)$/);
  if (byMatch) {
    return { type: 'label', prefix: byMatch[1] };
  }
  // Word at cursor
  const wordMatch = before.match(/(\w*)$/);
  const prefix = wordMatch ? wordMatch[1] : '';
  // If prefix looks like a metric or function start
  if (prefix.length > 0) {
    return { type: 'general', prefix };
  }
  return { type: 'general', prefix: '' };
}

function getSuggestions(query: string, cursorPos: number): Suggestion[] {
  const ctx = getContext(query, cursorPos);
  const results: Suggestion[] = [];
  const prefix = ctx.prefix.toLowerCase();

  if (ctx.type === 'labelValue' && ctx.labelName) {
    const values = MOCK_LABEL_VALUES[ctx.labelName] || [];
    for (const v of values) {
      if (!prefix || v.toLowerCase().includes(prefix)) {
        results.push({ text: v, type: 'labelValue', detail: ctx.labelName });
      }
    }
    return results.slice(0, 15);
  }

  if (ctx.type === 'label') {
    for (const l of MOCK_LABEL_NAMES) {
      if (!prefix || l.toLowerCase().includes(prefix)) {
        results.push({ text: l, type: 'label' });
      }
    }
    return results.slice(0, 15);
  }

  // General: functions, metrics, keywords
  if (ctx.type === 'general' || ctx.type === 'metric' || ctx.type === 'function') {
    // Functions
    for (const [name, info] of Object.entries(PROMQL_FUNCTIONS)) {
      if (!prefix || name.toLowerCase().includes(prefix)) {
        results.push({ text: name, type: 'function', detail: info.sig, insertText: `${name}(` });
      }
    }
    // Metrics
    for (const m of MOCK_METRICS) {
      if (!prefix || m.toLowerCase().includes(prefix)) {
        results.push({ text: m, type: 'metric' });
      }
    }
    // Keywords
    for (const k of PROMQL_KEYWORDS) {
      if (!prefix || k.toLowerCase().includes(prefix)) {
        results.push({ text: k, type: 'keyword' });
      }
    }
  }

  // Sort: exact prefix match first, then by type priority
  const typePriority: Record<string, number> = {
    function: 0,
    metric: 1,
    keyword: 2,
    label: 3,
    labelValue: 4,
    snippet: 5,
  };
  results.sort((a, b) => {
    const aExact = a.text.toLowerCase().startsWith(prefix) ? 0 : 1;
    const bExact = b.text.toLowerCase().startsWith(prefix) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return (typePriority[a.type] || 9) - (typePriority[b.type] || 9);
  });

  return results.slice(0, 20);
}

// ============================================================================
// Function Parameter Hints
// ============================================================================

function getFunctionHint(
  query: string,
  cursorPos: number
): { funcName: string; paramIndex: number; info: typeof PROMQL_FUNCTIONS[string] } | null {
  const before = query.slice(0, cursorPos);
  // Walk backwards to find the enclosing function call
  let depth = 0;
  let commaCount = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i] === ')') depth++;
    else if (before[i] === '(') {
      if (depth > 0) {
        depth--;
        continue;
      }
      // Found the opening paren — get function name
      const nameMatch = before.slice(0, i).match(/(\w+)\s*$/);
      if (nameMatch && PROMQL_FUNCTIONS[nameMatch[1]]) {
        return {
          funcName: nameMatch[1],
          paramIndex: commaCount,
          info: PROMQL_FUNCTIONS[nameMatch[1]],
        };
      }
      return null;
    } else if (before[i] === ',' && depth === 0) commaCount++;
  }
  return null;
}

// ============================================================================
// Suggestion Type Colors
// ============================================================================

const SUGGESTION_ICONS: Record<string, { color: string; label: string }> = {
  function: { color: '#006BB4', label: 'fn' },
  metric: { color: '#017D73', label: 'M' },
  label: { color: '#BD271E', label: 'L' },
  labelValue: { color: '#F5A700', label: 'V' },
  keyword: { color: '#9170B8', label: 'K' },
  snippet: { color: '#69707D', label: 'S' },
};

// ============================================================================
// PromQL Editor Component
// ============================================================================

export interface PromQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
  showLineNumbers?: boolean;
  hideToolbar?: boolean;
}

export const PromQLEditor: React.FC<PromQLEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter PromQL query...',
  height = 120,
  showLineNumbers = false,
  hideToolbar = false,
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [funcHint, setFuncHint] = useState<ReturnType<typeof getFunctionHint>>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Validate on change
  useEffect(() => {
    const timer = setTimeout(() => setErrors(validatePromQL(value)), 300);
    return () => clearTimeout(timer);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    const cursorPos = e.target.selectionStart;
    // Update suggestions
    const newSuggestions = getSuggestions(newValue, cursorPos);
    setSuggestions(newSuggestions);
    setShowSuggestions(newSuggestions.length > 0 && newValue.length > 0);
    setActiveSuggestion(0);
    // Update function hints
    setFuncHint(getFunctionHint(newValue, cursorPos));
  };

  const handleClick = () => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    setFuncHint(getFunctionHint(value, cursorPos));
  };

  const applySuggestion = (suggestion: Suggestion) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const ctx = getContext(value, cursorPos);
    const before = value.slice(0, cursorPos - ctx.prefix.length);
    const after = value.slice(cursorPos);
    const insertText = suggestion.insertText || suggestion.text;
    const newValue = before + insertText + after;
    onChange(newValue);
    setShowSuggestions(false);
    // Focus and set cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = before.length + insertText.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestion((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (activeSuggestion >= 0 && suggestions[activeSuggestion]) {
          e.preventDefault();
          applySuggestion(suggestions[activeSuggestion]);
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
    // Ctrl+Space to trigger suggestions
    if (e.key === ' ' && e.ctrlKey) {
      e.preventDefault();
      const cursorPos = textareaRef.current?.selectionStart || 0;
      const newSuggestions = getSuggestions(value, cursorPos);
      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0);
      setActiveSuggestion(0);
    }
  };

  const handlePrettify = () => {
    onChange(prettifyPromQL(value));
  };

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warnCount = errors.filter((e) => e.severity === 'warning').length;

  const lineCount = Math.max((value || '').split('\n').length, 1);
  const gutterWidth = showLineNumbers ? 36 : 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Editor container */}
      <div
        style={{
          position: 'relative',
          border: `1px solid ${errorCount > 0 ? '#BD271E' : '#D3DAE6'}`,
          borderRadius: 4,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {/* Line number gutter */}
        {showLineNumbers && (
          <div
            aria-hidden="true"
            style={{
              width: gutterWidth,
              minWidth: gutterWidth,
              padding: '8px 4px 8px 0',
              fontFamily: "'SFMono-Regular', 'Menlo', 'Monaco', monospace",
              fontSize: 13,
              lineHeight: '20px',
              textAlign: 'right',
              color: '#98A2B3',
              userSelect: 'none',
              borderRight: '1px solid #D3DAE6',
              background: '#F5F7FA',
              flexShrink: 0,
            }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        <div style={{ position: 'relative', flex: 1 }}>
          {/* Syntax highlight overlay */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              padding: '8px 12px',
              fontFamily: "'SFMono-Regular', 'Menlo', 'Monaco', monospace",
              fontSize: 13,
              lineHeight: '20px',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              pointerEvents: 'none',
              overflow: 'auto',
              color: 'transparent',
            }}
          >
            {value ? (
              renderHighlighted(value)
            ) : (
              <span style={{ color: '#98A2B3' }}>{placeholder}</span>
            )}
          </div>
          {/* Actual textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onFocus={() => {
              if (value) {
                const cursorPos = textareaRef.current?.selectionStart || 0;
                setFuncHint(getFunctionHint(value, cursorPos));
              }
            }}
            placeholder=""
            spellCheck={false}
            aria-label="PromQL query editor"
            style={{
              width: '100%',
              height,
              resize: 'vertical',
              border: 'none',
              outline: 'none',
              padding: '8px 12px',
              fontFamily: "'SFMono-Regular', 'Menlo', 'Monaco', monospace",
              fontSize: 13,
              lineHeight: '20px',
              background: 'transparent',
              color: 'transparent',
              caretColor: '#343741',
              position: 'relative',
              zIndex: 1,
            }}
          />
        </div>
      </div>

      {/* Toolbar */}
      {!hideToolbar && (
        <EuiFlexGroup
          gutterSize="s"
          alignItems="center"
          responsive={false}
          style={{ marginTop: 4 }}
        >
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Format query">
              <EuiButtonEmpty
                size="xs"
                iconType="editorCodeBlock"
                onClick={handlePrettify}
                isDisabled={!value}
              >
                Prettify
              </EuiButtonEmpty>
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              Ctrl+Space for suggestions
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem />
          {errorCount > 0 && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="danger">
                {errorCount} error{errorCount > 1 ? 's' : ''}
              </EuiBadge>
            </EuiFlexItem>
          )}
          {warnCount > 0 && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="warning">
                {warnCount} warning{warnCount > 1 ? 's' : ''}
              </EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      )}

      {/* Validation messages */}
      {errors.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {errors.map((err, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}
            >
              <EuiIcon
                type={
                  err.severity === 'error'
                    ? 'crossInACircleFilled'
                    : err.severity === 'warning'
                    ? 'alert'
                    : 'iInCircle'
                }
                color={
                  err.severity === 'error'
                    ? 'danger'
                    : err.severity === 'warning'
                    ? 'warning'
                    : 'subdued'
                }
                size="s"
              />
              <EuiText size="xs" color={err.severity === 'error' ? 'danger' : 'subdued'}>
                {err.message}
              </EuiText>
            </div>
          ))}
        </div>
      )}

      {/* Function parameter hint */}
      {funcHint && (
        <EuiPanel
          paddingSize="s"
          style={{
            position: 'absolute',
            top: height + 2,
            left: 0,
            zIndex: 1001,
            maxWidth: 400,
            border: '1px solid #D3DAE6',
          }}
        >
          <EuiText size="xs">
            <code style={{ color: '#006BB4' }}>{funcHint.info.sig}</code>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {funcHint.info.desc}
          </EuiText>
          {funcHint.info.params.length > 0 && (
            <EuiText size="xs" style={{ marginTop: 2 }}>
              {funcHint.info.params.map((p, i) => (
                <span
                  key={i}
                  style={{
                    fontWeight: i === funcHint!.paramIndex ? 700 : 400,
                    color: i === funcHint!.paramIndex ? '#006BB4' : '#69707D',
                  }}
                >
                  {i > 0 ? ', ' : ''}
                  {p}
                </span>
              ))}
            </EuiText>
          )}
        </EuiPanel>
      )}

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          style={{
            position: 'absolute',
            top: height + 2,
            left: 0,
            right: 0,
            zIndex: 1002,
            maxHeight: 250,
            overflow: 'auto',
            background: 'white',
            border: '1px solid #D3DAE6',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          {suggestions.map((s, i) => {
            const icon = SUGGESTION_ICONS[s.type] || { color: '#69707D', label: '?' };
            return (
              <div
                key={`${s.type}-${s.text}`}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: i === activeSuggestion ? '#E6F0FF' : 'white',
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
                onMouseEnter={() => setActiveSuggestion(i)}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 700,
                    background: icon.color + '20',
                    color: icon.color,
                  }}
                >
                  {icon.label}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}>{s.text}</span>
                {s.detail && (
                  <span
                    style={{
                      fontSize: 11,
                      color: '#98A2B3',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.detail}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
