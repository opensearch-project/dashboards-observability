/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { Datasource, UnifiedRule } from '../../../../common/types/alerting';
import { useRuleDetail } from '../hooks/use_rule_detail';
import { EditMonitor } from '../create_monitor/edit_monitor';

jest.mock('../hooks/use_rule_detail', () => ({
  useRuleDetail: jest.fn(),
}));

jest.mock('../create_monitor', () => ({
  CreateMonitor: (props: Record<string, unknown>) => {
    const init = props.initialForm as
      | { name?: string; indices?: string[]; timeField?: string }
      | undefined;
    return (
      <div
        data-test-subj="createMonitorMock"
        data-mode={String(props.mode)}
        data-indices={(init?.indices ?? []).join(',')}
      >
        mode={String(props.mode)}; name={init?.name ?? ''}
      </div>
    );
  },
  MonitorFormState: undefined,
}));

const useRuleDetailMock = useRuleDetail as jest.MockedFunction<typeof useRuleDetail>;

const osDs: Datasource = { id: 'ds-os', name: 'Local', type: 'opensearch', url: '', enabled: true };

const pplRule = (): UnifiedRule => ({
  id: 'rule-1',
  datasourceId: 'ds-os',
  datasourceType: 'opensearch',
  name: 'monitor-1',
  enabled: true,
  severity: 'high',
  query: 'source = logs-*',
  condition: 'count > 5',
  labels: {},
  annotations: {},
  monitorType: 'ppl',
  status: 'active',
  healthStatus: 'healthy',
  createdBy: '',
  createdAt: '2026-01-01T00:00:00Z',
  lastModified: '2026-01-01T00:00:00Z',
  notificationDestinations: [],
  evaluationInterval: '5 minutes',
  pendingPeriod: '5 minutes',
  description: '',
  alertHistory: [],
  conditionPreviewData: [],
  notificationRouting: [],
  suppressionRules: [],
  raw: {
    monitor_type: 'ppl_monitor',
    inputs: [{ ppl_input: { query: 'source = logs-*', query_language: 'ppl' } }],
    schedule: { period: { interval: 5, unit: 'MINUTES' } },
    triggers: [
      {
        ppl_trigger: {
          id: 't',
          name: 'trigger-1',
          severity: '2',
          actions: [],
          type: 'number_of_results',
          num_results_condition: '>',
          num_results_value: 5,
        },
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
});

describe('EditMonitor', () => {
  beforeEach(() => useRuleDetailMock.mockReset());

  it('shows a loading state while the rule is being fetched', () => {
    useRuleDetailMock.mockReturnValue({ data: null, isLoading: true, error: null });
    render(
      <EditMonitor
        dsId="ds-os"
        ruleId="rule-1"
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasources={[osDs]}
      />
    );
    expect(screen.getByText('Loading monitor…')).toBeTruthy();
  });

  it('shows an error state when the fetch fails', () => {
    useRuleDetailMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('boom'),
    });
    render(
      <EditMonitor
        dsId="ds-os"
        ruleId="rule-1"
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasources={[osDs]}
      />
    );
    expect(screen.getByText('Failed to load monitor')).toBeTruthy();
    expect(document.body.textContent).toContain('boom');
  });

  it('seeds CreateMonitor in edit mode for a PPL rule', () => {
    useRuleDetailMock.mockReturnValue({ data: pplRule(), isLoading: false, error: null });
    render(
      <EditMonitor
        dsId="ds-os"
        ruleId="rule-1"
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasources={[osDs]}
      />
    );
    const mock = screen.getByTestId('createMonitorMock');
    expect(mock.getAttribute('data-mode')).toBe('edit');
    expect(mock.textContent).toContain('name=monitor-1');
    // The seeder parses `source = logs-*` out of the PPL query so the picker
    // round-trips the index list on edit.
    expect(mock.getAttribute('data-indices')).toBe('logs-*');
  });

  it('refuses to edit Prometheus rules', () => {
    const promRule = pplRule();
    promRule.datasourceType = 'prometheus';
    useRuleDetailMock.mockReturnValue({ data: promRule, isLoading: false, error: null });
    render(
      <EditMonitor
        dsId="ds-os"
        ruleId="rule-1"
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasources={[osDs]}
      />
    );
    expect(screen.getByText('Edit not supported')).toBeTruthy();
  });
});
