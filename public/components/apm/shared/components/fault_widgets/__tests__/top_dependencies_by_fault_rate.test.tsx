/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';
import { TopDependenciesByFaultRate } from '../top_dependencies_by_fault_rate';
import { buildScopeFilters, PageScope, ScopeNode } from '../../../utils/scope_filters';

const mockUseTopDependenciesByFaultRate = jest.fn();
jest.mock('../../../hooks/use_top_dependencies_by_fault_rate', () => ({
  useTopDependenciesByFaultRate: (params: unknown) => mockUseTopDependenciesByFaultRate(params),
}));

jest.mock('../../../utils/time_utils', () => ({
  parseTimeRange: jest.fn(() => ({
    startTime: new Date('2024-01-01T00:00:00Z'),
    endTime: new Date('2024-01-01T01:00:00Z'),
  })),
}));

const catalog: ScopeNode[] = [
  { serviceName: 'frontend', environment: 'prod', type: 'service' },
  { serviceName: 'cart', environment: 'prod', type: 'service' },
  { serviceName: 'postgres', environment: 'prod', type: 'database' },
  { serviceName: 'redis', environment: 'prod', type: 'database' },
  { serviceName: 'kafka', environment: 'prod', type: 'messaging' },
];

const lastParams = () => {
  const calls = mockUseTopDependenciesByFaultRate.mock.calls;
  return calls[calls.length - 1][0];
};

describe('TopDependenciesByFaultRate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTopDependenciesByFaultRate.mockReturnValue({ data: [], isLoading: false, error: null });
  });

  it('with only a dependency Type filter, runs the topk per dependency name batch', () => {
    const services = catalog.filter((s) => s.type === 'database');
    const scope: PageScope = {
      filters: buildScopeFilters({ catalog, scope: services, needsNameList: false }),
      services,
    };
    // The Type filter alone yields no target list: without batches the query would scan every
    // caller and target.
    expect(scope.filters.dependencyFilter).toBeUndefined();

    render(<TopDependenciesByFaultRate timeRange={{ from: 'now-1h', to: 'now' }} scope={scope} />);
    const params = lastParams();
    expect(params.remoteBatches).toEqual(['remoteService=~"postgres|redis"']);
    expect(params.remoteFilter).toBeUndefined();
    expect(params.callerBatches).toBeUndefined();
    expect(params.include({ source: 'frontend', target: 'redis', environment: 'prod' })).toBe(true);
    expect(params.include({ source: 'frontend', target: 'kafka', environment: 'prod' })).toBe(
      false
    );
  });

  it('runs one batch per scope dependency batch', () => {
    const services = catalog.filter((s) => s.type !== 'service');
    const filters = {
      ...buildScopeFilters({ catalog, scope: services, needsNameList: false }),
      dependencyBatches: [
        { names: ['postgres', 'redis'], filter: 'remoteService=~"postgres|redis"' },
        { names: ['kafka'], filter: 'remoteService=~"kafka"' },
      ],
    };
    render(
      <TopDependenciesByFaultRate
        timeRange={{ from: 'now-1h', to: 'now' }}
        scope={{ filters, services }}
      />
    );
    expect(lastParams().remoteBatches).toEqual([
      'remoteService=~"postgres|redis"',
      'remoteService=~"kafka"',
    ]);
  });

  it('keeps caller-bounded scopes and unscoped use off the target batches', () => {
    const services = catalog.filter((s) => s.type === 'service');
    render(
      <TopDependenciesByFaultRate
        timeRange={{ from: 'now-1h', to: 'now' }}
        scope={{ filters: buildScopeFilters({ catalog, scope: services }), services }}
      />
    );
    expect(lastParams().remoteBatches).toBeUndefined();
    expect(lastParams().callerFilter).toBe('service=~"frontend|cart"');

    render(<TopDependenciesByFaultRate timeRange={{ from: 'now-1h', to: 'now' }} />);
    expect(lastParams().remoteBatches).toBeUndefined();
    expect(lastParams().remoteFilter).toBeUndefined();
  });
});
