/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Standalone PromQL validation and prettification.
 */

export interface PromQLError {
  message: string;
  severity: 'error' | 'warning' | 'info';
  position?: number;
  type: string;
}

export interface PromQLValidationResult {
  errors: PromQLError[];
  warnings: PromQLError[];
}

const RANGE_REQUIRED_FNS = [
  'rate',
  'irate',
  'increase',
  'delta',
  'deriv',
  'changes',
  'resets',
  'avg_over_time',
  'min_over_time',
  'max_over_time',
  'sum_over_time',
  'count_over_time',
  'quantile_over_time',
  'last_over_time',
  'absent_over_time',
  'predict_linear',
];

export function validatePromQL(query: string): PromQLValidationResult {
  const errors: PromQLError[] = [];
  const warnings: PromQLError[] = [];
  if (!query || !query.trim()) return { errors, warnings };

  // Bracket matching
  const stack: Array<{ char: string; pos: number }> = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closing: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (let i = 0; i < query.length; i++) {
    if (pairs[query[i]]) stack.push({ char: query[i], pos: i });
    else if (closing[query[i]]) {
      if (stack.length === 0 || stack[stack.length - 1].char !== closing[query[i]]) {
        errors.push({
          message: `Unmatched '${query[i]}' at position ${i}`,
          severity: 'error',
          position: i,
          type: 'bracket',
        });
      } else {
        stack.pop();
      }
    }
  }
  for (const s of stack) {
    errors.push({
      message: `Unclosed '${s.char}' at position ${s.pos}`,
      severity: 'error',
      position: s.pos,
      type: 'bracket',
    });
  }

  // Empty label matchers
  if (/\{\s*\}/.test(query)) {
    warnings.push({
      message: 'Empty label matcher — consider adding filters to reduce cardinality',
      severity: 'warning',
      type: 'label-matcher',
    });
  }

  // Missing range vector
  for (const fn of RANGE_REQUIRED_FNS) {
    const regex = new RegExp(`\\b${fn}\\s*\\((?![^)]*\\[)`);
    if (regex.test(query)) {
      errors.push({
        message: `${fn}() requires a range vector selector [duration], e.g. ${fn}(metric[5m])`,
        severity: 'error',
        type: 'range-vector',
      });
    }
  }

  // High-cardinality warning
  if (/\brate\b/.test(query) && !/\brate\b.*\{[^}]*\}/.test(query)) {
    warnings.push({
      message: 'Consider adding label filters to rate() to reduce cardinality',
      severity: 'info',
      type: 'cardinality',
    });
  }

  return { errors, warnings };
}

export function prettifyPromQL(query: string): string {
  let r = query.trim();
  if (!r) return r;
  // Normalize spaces around binary operators (but not inside [] or {})
  r = r.replace(/\s*([\+\-\*\/\%\^])\s*/g, ' $1 ');
  r = r.replace(/\s*(==|!=|>=|<=|=~|!~|>|<)\s*/g, ' $1 ');
  // Newline after ) by/without
  r = r.replace(/\)\s*(by|without)\s*\(/g, ')\n  $1 (');
  // Newline after aggregation operators
  r = r.replace(/(sum|avg|min|max|count|stddev|topk|bottomk|quantile)\s*\(\s*/g, '$1(\n  ');
  // Clean up multiple spaces (but not leading whitespace on lines)
  r = r.replace(/ {2,}/g, ' ');
  // Clean up spaces before commas
  r = r.replace(/\s+,/g, ',');
  // Ensure no trailing whitespace on lines
  r = r.replace(/[ \t]+$/gm, '');
  return r;
}
