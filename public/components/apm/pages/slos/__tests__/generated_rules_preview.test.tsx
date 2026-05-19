/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Asserts the wizard preview chip renders the workspace-scoped namespace
 * the server returned (e.g. `slo-generated-ws-alpha`) — not the bare
 * `SLO_RULER_NAMESPACE` constant. Bug-1 regression guard:
 * pre-fix the chip read from the imported constant and would always show
 * `slo-generated`, regardless of which workspace the saved doc landed in.
 */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';

import { GeneratedRulesPreview, PREVIEW_DEBOUNCE_MS } from '../generated_rules_preview';
import type { GeneratedRuleGroup, SloCreateInput } from '../../../../../../common/slo/slo_types';

function dummyInput(): SloCreateInput {
  // The component only round-trips the input through JSON.stringify before
  // handing it to the mocked apiClient — it is never validated client-side
  // here, so a partial spec is fine for this test's purposes. We assert
  // the rendered chip from the apiClient response, not from the input.
  return ({ id: 'slo-1', spec: { name: 'demo' } } as unknown) as SloCreateInput;
}

function ruleGroupFor(rulerNamespace: string): GeneratedRuleGroup {
  return {
    groupName: 'slo:demo_abcd1234',
    rulerNamespace,
    interval: 60,
    rules: [
      {
        type: 'recording',
        name: 'slo:sli_error:ratio_rate_5m:demo_abcd1234',
        expr: 'vector(0)',
        labels: {},
        description: 'rec',
      },
    ],
    yaml: 'name: slo:demo_abcd1234\n',
  };
}

describe('GeneratedRulesPreview — namespace chip', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function flushDebounceAndPromises(): Promise<void> {
    // The component debounces serialized input, then issues the preview
    // request. Step the timer, then let microtasks settle so the promise
    // resolves and re-render lands.
    await act(async () => {
      jest.advanceTimersByTime(PREVIEW_DEBOUNCE_MS + 1);
    });
    await act(async () => {
      // microtask flush
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('renders the rulerNamespace returned by the server (workspace-suffixed)', async () => {
    const apiClient = {
      preview: jest.fn().mockResolvedValue(ruleGroupFor('slo-generated-ws-alpha')),
    };
    const { getByTestId } = render(
      <GeneratedRulesPreview apiClient={apiClient as never} input={dummyInput()} />
    );

    await flushDebounceAndPromises();

    await waitFor(() => expect(getByTestId('slosWizardPreviewSuccess')).toBeInTheDocument());
    expect(getByTestId('slosWizardPreviewNamespace').textContent).toContain(
      'slo-generated-ws-alpha'
    );
    // Pre-fix regression guard: the bare constant must not show up.
    expect(getByTestId('slosWizardPreviewNamespace').textContent).not.toMatch(
      /\bslo-generated\b(?!-)/
    );
  });

  it('renders the default workspace suffix when the server stamps slo-generated-default', async () => {
    const apiClient = {
      preview: jest.fn().mockResolvedValue(ruleGroupFor('slo-generated-default')),
    };
    const { getByTestId } = render(
      <GeneratedRulesPreview apiClient={apiClient as never} input={dummyInput()} />
    );

    await flushDebounceAndPromises();

    await waitFor(() => expect(getByTestId('slosWizardPreviewSuccess')).toBeInTheDocument());
    expect(getByTestId('slosWizardPreviewNamespace').textContent).toContain(
      'slo-generated-default'
    );
  });
});
