/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromQL helpers that turn an alerting expression into the series worth charting. Shared by the
 * server (rule preview) and the browser (Explore links). Best-effort text handling, not a parser:
 * anything they can't take apart safely is returned unchanged.
 */

/**
 * The expression with label-matcher braces and quoted strings emptied, so operator checks don't
 * see the `!=` / `=~` inside `{code!="200"}` or text inside a string.
 */
function outsideMatchersAndStrings(expr: string): string {
  return expr
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`/g, '""')
    .replace(/\{[^}]*\}/g, '{}');
}

/**
 * Strip a single trailing comparison (`> 0.5`, `>= 1e3`, `!= -2`, …) off a
 * PromQL alert expression so a preview can chart the underlying metric series
 * rather than the boolean 0/1 the full alert condition would produce.
 *
 * Best-effort by design: it only removes the LAST trailing comparison, so a
 * compound condition like `a > 1 and b > 2` is intentionally left unchanged
 * (the metric expression can't be safely recovered) rather than mangled into
 * `a > 1 and b`. Handles integers, decimals, scientific notation and negative
 * thresholds. Shared by the Prometheus preview route and the rule-detail
 * condition preview so both strip identically.
 */
export function stripTrailingComparison(query: string): string {
  const trimmed = (query || '').trim();
  const stripped = trimmed
    .replace(/\s*(>=|<=|!=|==|>|<)\s*-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*$/, '')
    .trim();
  // No trailing comparison matched, or stripping emptied the query → leave as-is.
  if (!stripped || stripped === trimmed) return trimmed;
  // If the remainder still contains a comparison operator, the original was a
  // compound condition (e.g. `a > 1 and b > 2`) — stripping only the tail would
  // produce a nonsensical `a > 1 and b`, so preserve the original instead of
  // charting a mangled expression.
  if (/(>=|<=|!=|==|>|<)/.test(outsideMatchersAndStrings(stripped))) return trimmed;
  return stripped;
}

/**
 * Split an alerting expression on its top-level `and` operators: `A > 1 and B > 2` →
 * [`A > 1`, `B > 2`]. `and` inside parentheses, braces, brackets or strings doesn't count, and an
 * `on(...)` / `ignoring(...)` matching modifier after `and` is dropped from the right side.
 * Multi-window rules (e.g. burn-rate alerts) are written this way, and the full expression
 * returns series only while it fires, so each side is charted on its own. Returns the expression
 * as its only part when it has no top-level `and`.
 */
export function splitTopLevelAnd(query: string): string[] {
  const text = (query || '').trim();
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    else if (
      depth === 0 &&
      /\s/.test(text[i - 1] || '') &&
      text.slice(i, i + 3).toLowerCase() === 'and' &&
      /\s/.test(text[i + 3] || '')
    ) {
      parts.push(text.slice(start, i).trim());
      start = i + 3;
      i += 2;
    }
  }
  parts.push(text.slice(start).trim());
  return parts
    .map((p) => p.replace(/^(on|ignoring)\s*\([^)]*\)\s*/i, '').trim())
    .filter((p) => p.length > 0);
}

/**
 * The expressions to chart for an alerting rule's condition: each top-level `and` side with its
 * trailing comparison stripped. When any side can't be reduced to a plain series expression (a
 * nested comparison, `or` / `unless`), the whole expression is returned unchanged as one part.
 */
export function signalExpressions(query: string): string[] {
  const trimmed = (query || '').trim();
  if (!trimmed) return [];
  const sides = splitTopLevelAnd(trimmed);
  if (sides.length < 2) return [stripTrailingComparison(trimmed)];
  const stripped = sides.map((side) => stripTrailingComparison(side));
  const clean = stripped.every((side, i) => {
    const bare = outsideMatchersAndStrings(side);
    return side !== sides[i] && !/\s(or|unless)\s/i.test(bare) && !/(>=|<=|!=|==|>|<)/.test(bare);
  });
  return clean ? stripped : [trimmed];
}
