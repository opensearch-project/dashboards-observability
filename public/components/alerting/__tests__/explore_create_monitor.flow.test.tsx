/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Explore-launched create flow: the seed form anchors the look-back window on
 * Explore's time field (default-on), the saved payload carries the window, and
 * backend PPL errors — incl. the query-length error that names the cluster's
 * real limit — surface inline under the editor.
 */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';

const mockCreateMonitor = jest.fn();
const mockSetToast = jest.fn();
let mockLastProps: Record<string, any> = {};

jest.mock('../create_monitor', () => ({
  CreateMonitor: (props: Record<string, any>) => {
    mockLastProps = props;
    return <div data-test-subj="mockCreateMonitor" />;
  },
}));
jest.mock('../hooks/use_datasources', () => ({
  useDatasources: () => ({
    datasources: [
      { id: 'ds-local', name: 'local_cluster', type: 'opensearch', url: '', enabled: true },
    ],
    isLoading: false,
  }),
}));
jest.mock('../hooks/use_monitor_mutations', () => ({
  useMonitorMutations: () => ({ createMonitor: mockCreateMonitor }),
}));
jest.mock('../hooks/use_rules_data', () => ({ useRulesData: () => ({ rules: [] }) }));
jest.mock('../../common/toast', () => ({ useToast: () => ({ setToast: mockSetToast }) }));
jest.mock('../toast_helpers', () => ({ showMonitorCreatedToast: jest.fn() }));

import { ExploreCreateMonitor } from '../explore_create_monitor';

const renderFlow = () =>
  render(
    <ExploreCreateMonitor
      exploreContext={{
        indexPattern: 'logs-*',
        timeFieldName: '@timestamp',
        queryInEditor: 'source = logs-* | where level = "ERROR"',
      }}
      onClose={jest.fn()}
    />
  );

const save = async (overrides: Record<string, unknown> = {}) => {
  await act(async () => {
    await mockLastProps.onSave({ ...mockLastProps.initialForm, name: 'r', ...overrides });
  });
};

describe('ExploreCreateMonitor flow', () => {
  beforeEach(() => {
    mockCreateMonitor.mockReset();
    mockSetToast.mockReset();
    mockLastProps = {};
  });

  it("seeds the form with Explore's time field as the single look-back anchor", () => {
    renderFlow();
    expect(mockLastProps.initialForm).toMatchObject({
      datasourceId: 'ds-local',
      indices: ['logs-*'],
      timeField: '@timestamp',
      useLookBackWindow: true,
      query: 'source = logs-* | where level = "ERROR"',
    });
    expect(mockLastProps.initialForm).not.toHaveProperty('lookbackTimestampField');
  });

  it('saves the query with the default 1-hour look-back on the Time field', async () => {
    mockCreateMonitor.mockResolvedValue({});
    renderFlow();
    await save();
    const [payload, dsId] = mockCreateMonitor.mock.calls[0];
    expect(dsId).toBe('ds-local');
    expect(payload.inputs[0].ppl_input.query).toBe(
      'source = logs-* | where @timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR) | where level = "ERROR"'
    );
  });

  it('shows the backend query-length error (real cluster limit) inline', async () => {
    mockCreateMonitor.mockRejectedValue(
      new Error(
        'alerting_exception: [alerting_exception] Reason: PPL Query length must be at most 4000 but was 4210'
      )
    );
    renderFlow();
    await save();
    await waitFor(() =>
      expect(mockLastProps.submitError).toEqual({
        pplMessage: 'PPL Query length must be at most 4000 but was 4210',
      })
    );
    expect(mockSetToast).toHaveBeenCalledWith(
      'Failed to create alert rule',
      'danger',
      expect.stringContaining('PPL Query length must be at most 4000')
    );
  });

  it('shows a PPL validation error inline and clears it on request', async () => {
    mockCreateMonitor.mockRejectedValue(
      new Error('PPL Query validation failed: [x] is not a valid term')
    );
    renderFlow();
    await save();
    await waitFor(() =>
      expect(mockLastProps.submitError?.pplMessage).toMatch(/^PPL Query validation failed: \[x\]/)
    );
    act(() => mockLastProps.onClearPplSubmitError());
    await waitFor(() => expect(mockLastProps.submitError).toBeUndefined());
  });

  it('does not set an inline error for unrelated failures', async () => {
    mockCreateMonitor.mockRejectedValue(new Error('Network down'));
    renderFlow();
    await save();
    await waitFor(() => expect(mockSetToast).toHaveBeenCalled());
    expect(mockLastProps.submitError).toBeUndefined();
  });
});
