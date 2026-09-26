/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenSearchFormSection wiring for the look-back window: the preview runs the
 * effective query (look-back clause added), the length advisory counts that
 * effective query and never blocks, and look-back edits (incl. the Time field
 * it picks) flow back into the form.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { OpenSearchFormSection } from '../opensearch_form_section';
import { DEFAULT_OS_FORM, OpenSearchFormState } from '../create_monitor_types';

const mockPreviewQuery = jest.fn();
jest.mock('../sections/ppl_preview_panel', () => ({
  PplPreviewPanel: (p: { query: string }) => {
    mockPreviewQuery(p.query);
    return <div data-test-subj="mockPreview">{p.query}</div>;
  },
}));
jest.mock('../sections/ppl_query_editor', () => ({
  PplQueryEditor: () => <div data-test-subj="mockQueryEditor" />,
}));
jest.mock('../sections/query_toolbar', () => ({
  QueryToolbar: () => <div data-test-subj="mockToolbar" />,
}));
jest.mock('../sections/ppl_triggers', () => ({
  PplTriggersSection: () => <div data-test-subj="mockTriggers" />,
}));
jest.mock('../sections/ppl_lookback_editor', () => ({
  PplLookbackEditor: (p: {
    timeField: string;
    query: string;
    onUpdate: (patch: Record<string, unknown>) => void;
  }) => (
    <div data-test-subj="mockLookback" data-time-field={p.timeField} data-query={p.query}>
      <button onClick={() => p.onUpdate({ useLookBackWindow: false })}>lb-off</button>
      <button onClick={() => p.onUpdate({ lookBackAmount: 5, lookBackUnit: 'minutes' })}>
        lb-5m
      </button>
      <button onClick={() => p.onUpdate({ timeField: 'time' })}>lb-pick-time</button>
    </div>
  ),
}));
jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: { application: { navigateToApp: jest.fn() } },
}));

const renderSection = (overrides: Partial<OpenSearchFormState> = {}) => {
  const onUpdate = jest.fn();
  const form: OpenSearchFormState = {
    ...DEFAULT_OS_FORM,
    datasourceId: 'ds-1',
    indices: ['logs'],
    timeField: '@timestamp',
    query: 'source = logs | stats count()',
    ...overrides,
  };
  render(
    <OpenSearchFormSection
      form={form}
      onUpdate={onUpdate}
      validationErrors={{}}
      hasSubmitted={false}
      datasources={[]}
      onDatasourceChange={jest.fn()}
    />
  );
  return onUpdate;
};

const byTestSubj = (s: string) => document.querySelector(`[data-test-subj="${s}"]`);

describe('OpenSearchFormSection — look-back wiring', () => {
  beforeEach(() => mockPreviewQuery.mockClear());

  it('previews the effective query (look-back clause added on the Time field)', () => {
    renderSection();
    expect(mockPreviewQuery).toHaveBeenLastCalledWith(
      'source = logs | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR) | stats count()'
    );
  });

  it('previews the query unchanged when look-back is off or no Time field', () => {
    renderSection({ useLookBackWindow: false });
    expect(mockPreviewQuery).toHaveBeenLastCalledWith('source = logs | stats count()');
    renderSection({ timeField: '' });
    expect(mockPreviewQuery).toHaveBeenLastCalledWith('source = logs | stats count()');
  });

  it("passes the user's query (not the effective one) and the Time field to the editor", () => {
    renderSection();
    const lb = byTestSubj('mockLookback')!;
    expect(lb.getAttribute('data-time-field')).toBe('@timestamp');
    expect(lb.getAttribute('data-query')).toBe('source = logs | stats count()');
  });

  it('applies every key of a look-back patch, including the Time field', () => {
    const onUpdate = renderSection();
    fireEvent.click(screen.getByText('lb-5m'));
    expect(onUpdate).toHaveBeenCalledWith('lookBackAmount', 5);
    expect(onUpdate).toHaveBeenCalledWith('lookBackUnit', 'minutes');
    fireEvent.click(screen.getByText('lb-off'));
    expect(onUpdate).toHaveBeenCalledWith('useLookBackWindow', false);
    fireEvent.click(screen.getByText('lb-pick-time'));
    expect(onUpdate).toHaveBeenCalledWith('timeField', 'time');
  });
});

describe('OpenSearchFormSection — query length advisory', () => {
  // ~1980 chars: fits under the 2000 default alone; the ~55-char clause pushes it over.
  const nearLimit = `source = logs | where ${'a'.repeat(1958)}`;

  it('counts the effective query and shows no advisory under the default', () => {
    renderSection({ useLookBackWindow: false, query: 'source = logs' });
    expect(byTestSubj('alertManagerPplQueryCharCount')!.textContent).toBe('13 characters');
    expect(byTestSubj('alertManagerPplQueryLengthAdvisory')).toBeNull();
  });

  it('blames the look-back clause when it is what crosses the default', () => {
    renderSection({ query: nearLimit });
    expect(byTestSubj('alertManagerPplQueryLengthAdvisory')!.textContent).toMatch(
      /With the look-back filter, the saved query is/
    );
  });

  it('shows the plain advisory for a query over the default on its own', () => {
    renderSection({ query: `source = logs | where ${'b'.repeat(2100)}` });
    expect(byTestSubj('alertManagerPplQueryLengthAdvisory')!.textContent).toMatch(
      /This query is long/
    );
  });

  it('shows no advisory for the same near-limit query with look-back off', () => {
    renderSection({ query: nearLimit, useLookBackWindow: false });
    expect(byTestSubj('alertManagerPplQueryLengthAdvisory')).toBeNull();
  });
});
