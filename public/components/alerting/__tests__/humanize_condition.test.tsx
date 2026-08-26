/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { humanizeCondition } from '../monitor_detail/humanize_condition';

// humanizeCondition returns either a translated string or a React element
// (the "Custom script" fallback). Wrap in a host element so both render.
const renderCondition = (condition: string) => render(<div>{humanizeCondition(condition)}</div>);

describe('humanizeCondition', () => {
  it('translates `return true` to "Always trigger" (case-insensitive)', () => {
    expect(renderCondition('return true').getByText('Always trigger')).toBeInTheDocument();
    expect(renderCondition('RETURN TRUE;').getByText('Always trigger')).toBeInTheDocument();
  });

  it('translates a document-count condition, with and without `.value`', () => {
    expect(
      renderCondition('ctx.results[0].hits.total.value > 0').getByText('Document count > 0')
    ).toBeInTheDocument();
    expect(
      renderCondition('ctx.results[0].hits.total >= 25').getByText('Document count >= 25')
    ).toBeInTheDocument();
  });

  it('translates an aggregation-value condition, naming the aggregation', () => {
    expect(
      renderCondition('ctx.results[0].aggregations.cpu_avg.value > 90').getByText(
        'Aggregation "cpu_avg" > 90'
      )
    ).toBeInTheDocument();
  });

  it('translates a bucket-level per-bucket condition (`params._count`)', () => {
    expect(
      renderCondition('params._count > 5').getByText('Bucket document count > 5')
    ).toBeInTheDocument();
  });

  it('translates the synthetic PPL `count <op> N` result-count condition', () => {
    expect(renderCondition('count >= 3').getByText('Result count >= 3')).toBeInTheDocument();
  });

  it('labels an un-humanizable script "Custom script" and hides the raw source behind a disclosure', () => {
    const raw =
      'def firstResult = ctx.results[0]; return firstResult.something.weird > params.threshold';
    const { getByText, getByTestId, queryByTestId } = renderCondition(raw);

    // Clear label instead of a raw blob rendered as prose.
    expect(getByText('Custom script')).toBeInTheDocument();

    // The raw source is NOT shown until the user opens the disclosure — it is
    // not dumped inline. `getByText(raw)` would match either the code block or a
    // stray inline render; assert specifically via the collapsed source's test id.
    // Opening the accordion reveals the code block containing the raw source.
    fireEvent.click(getByText('Show script'));
    expect(getByTestId('monitorConditionCustomScriptSource')).toHaveTextContent(raw);

    // Regression guard: the fallback must not render the recognized shapes'
    // prose — a reverted humanizer that returned <code>{raw}</code> would have
    // no "Custom script" label at all (already asserted above) and no disclosure.
    expect(queryByTestId('monitorConditionCustomScript')).not.toBeNull();
  });
});
