/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';
import { buildTableColumns, datasourceCellLines } from '../monitors_table_columns';
import type { Datasource, UnifiedRuleSummary } from '../../../../../common/types/alerting';

const baseParams = {
  filtered: [] as UnifiedRuleSummary[],
  selectedIds: new Set<string>(),
  columnWidths: {},
  dsNameMap: new Map<string, string>(),
  toggleSelect: jest.fn(),
  toggleSelectAll: jest.fn(),
  setSelectedMonitor: jest.fn(),
};

// Pull a single column's `render` out of the built column set by field name so
// the tests exercise the exact cell renderer the table uses.
const renderCell = (field: string, value: unknown) => {
  const cols = buildTableColumns({
    ...baseParams,
    visibleColumns: new Set([field]),
  });
  const col = cols.find((c) => c.field === field) as
    { render?: (v: unknown, item?: UnifiedRuleSummary) => React.ReactNode } | undefined;
  if (!col?.render) throw new Error(`no render for column "${field}"`);
  // The table always hands the cell renderer the row as the 2nd arg; the status
  // renderer reads it to detect optimistic "pending" rows. Pass a minimal
  // non-pending row (real id, so isPending() is false) so we exercise the
  // label path the assertions below check.
  const item = { status: value, id: 'rule-1' } as UnifiedRuleSummary;
  return render(<div>{col.render(value, item)}</div>);
};

describe('monitors_table_columns cell labels', () => {
  // The alerts table reads "Active"/"Medium"/"Healthy"; before this change the
  // rules table rendered the raw lowercase backend tokens next to it, so the
  // same vocabulary read two different ways on adjacent tabs.
  it('title-cases the status cell instead of showing the raw token', () => {
    const { getByText, queryByText } = renderCell('status', 'active');
    expect(getByText('Active')).toBeInTheDocument();
    expect(queryByText('active')).toBeNull();
  });

  it('title-cases the severity cell', () => {
    const { getByText, queryByText } = renderCell('severity', 'medium');
    expect(getByText('Medium')).toBeInTheDocument();
    expect(queryByText('medium')).toBeNull();
  });

  it('renders the health cell without leaking the no_data underscore', () => {
    const { getByText, queryByText } = renderCell('healthStatus', 'no_data');
    expect(getByText('No data')).toBeInTheDocument();
    expect(queryByText('no_data')).toBeNull();
  });

  it('passes AD/forecaster lifecycle statuses through unchanged', () => {
    // These arrive already display-ready; re-casing them would corrupt the
    // wording, so the label getter must leave them alone.
    const { getByText } = renderCell('status', 'Awaiting data to init');
    expect(getByText('Awaiting data to init')).toBeInTheDocument();
  });
});

describe('monitors_table_columns CloudWatch state at the window end', () => {
  const cwRule = {
    id: 'checkout-errors-high',
    name: 'checkout-errors-high',
    datasourceId: 'cloudwatch',
    datasourceType: 'cloudwatch',
    status: 'active',
    healthStatus: 'healthy',
    cloudWatch: { state: 'ALARM', alarmType: 'metric' },
  } as UnifiedRuleSummary;
  const cell = (
    field: string,
    stateAt?: Parameters<typeof buildTableColumns>[0]['cloudWatchStateAt']
  ) => {
    const cols = buildTableColumns({
      ...baseParams,
      visibleColumns: new Set([field]) as Parameters<typeof buildTableColumns>[0]['visibleColumns'],
      cloudWatchStateAt: stateAt,
    });
    const col = cols.find((c) => c.field === field) as {
      render: (v: unknown, item: UnifiedRuleSummary) => React.ReactNode;
    };
    return render(<div>{col.render((cwRule as never)[field], cwRule)}</div>);
  };

  it('shows the current state when the window ends now', () => {
    const { getByText } = cell('status');
    expect(getByText('Active')).toBeInTheDocument();
    expect(getByText('CW: In alarm')).toBeInTheDocument();
  });

  it('shows the state at the window end in Status and Health', () => {
    const at = {
      state: 'INSUFFICIENT_DATA' as const,
      atMs: Date.now() - 86_400_000,
      complete: true,
    };
    const status = cell('status', () => at);
    expect(status.getByText('Insufficient data')).toBeInTheDocument();
    expect(status.getByText('CW: Insufficient data')).toBeInTheDocument();
    expect(status.getByTestId('cloudWatchStatusAtWindowEnd')).toBeInTheDocument();
    status.unmount();
    expect(cell('healthStatus', () => at).getByText('No data')).toBeInTheDocument();
  });

  it("says No history when the window end is older than CloudWatch's history", () => {
    const at = { atMs: Date.now() - 200 * 86_400_000, complete: true };
    const status = cell('status', () => at);
    expect(status.getByTestId('cloudWatchStatusUnknownAtWindowEnd')).toHaveTextContent(
      'No history'
    );
    expect(status.queryByText('CW: In alarm')).toBeNull();
    status.unmount();
    expect(cell('healthStatus', () => at).getByText('—')).toBeInTheDocument();
  });
});

describe('monitors_table_columns Datasource cell', () => {
  const ds = (d: Partial<Datasource> & Pick<Datasource, 'id' | 'name' | 'type'>): Datasource => ({
    url: '',
    enabled: true,
    ...d,
  });
  const dsById = new Map<string, Datasource>(
    [
      ds({ id: 'os-1', name: 'Local Cluster', type: 'opensearch' }),
      ds({ id: 'prom-1', name: 'prod-amp-workspace', type: 'prometheus', region: 'us-west-2' }),
      ds({
        id: 'cloudwatch_us-east-1_prod',
        name: 'CloudWatch · Prod account · us-east-1',
        type: 'cloudwatch',
        region: 'us-east-1',
        cloudWatchScope: 'prod',
        cloudWatchScopeLabel: 'Prod account',
      }),
      ds({
        id: 'cloudwatch',
        name: 'CloudWatch',
        type: 'cloudwatch',
        cloudWatchScopeLabel: 'CloudWatch',
      }),
    ].map((d) => [d.id, d])
  );
  const row = (over: Partial<UnifiedRuleSummary>) => over as unknown as UnifiedRuleSummary;

  it('reads "<Type> • <source>" with the account id and region below for CloudWatch', () => {
    expect(
      datasourceCellLines(
        row({
          datasourceId: 'cloudwatch_us-east-1_prod',
          datasourceType: 'cloudwatch',
          cloudWatch: {
            state: 'ALARM',
            alarmType: 'metric',
            accountId: '444455556666',
            region: 'us-east-1',
          },
        }),
        new Map(),
        dsById
      )
    ).toEqual(['CloudWatch • Prod account', '444455556666 • us-east-1']);
  });

  it('omits an account id the source does not report', () => {
    expect(
      datasourceCellLines(
        row({
          datasourceId: 'cloudwatch_us-east-1_prod',
          datasourceType: 'cloudwatch',
          cloudWatch: { state: 'OK', alarmType: 'metric', region: 'us-east-1' },
        }),
        new Map(),
        dsById
      )
    ).toEqual(['CloudWatch • Prod account', 'us-east-1']);
  });
  it('shows the account id once when the first line already has it', () => {
    const repeated = new Map(dsById);
    repeated.set(
      'cloudwatch_us-east-1_s2',
      ds({
        id: 'cloudwatch_us-east-1_s2',
        name: 'CloudWatch · Prod (222222222222) · us-east-1',
        type: 'cloudwatch',
        region: 'us-east-1',
        cloudWatchScope: 's2',
        cloudWatchScopeLabel: 'Prod (222222222222)',
      })
    );
    expect(
      datasourceCellLines(
        row({
          datasourceId: 'cloudwatch_us-east-1_s2',
          datasourceType: 'cloudwatch',
          cloudWatch: {
            state: 'ALARM',
            alarmType: 'metric',
            accountId: '222222222222',
            region: 'us-east-1',
          },
        }),
        new Map(),
        repeated
      )
    ).toEqual(['CloudWatch • Prod (222222222222)', 'us-east-1']);
  });

  it('labels the legacy single CloudWatch datasource just "CloudWatch"', () => {
    expect(
      datasourceCellLines(
        row({ datasourceId: 'cloudwatch', datasourceType: 'cloudwatch' }),
        new Map(),
        dsById
      )
    ).toEqual(['CloudWatch', undefined]);
  });

  it('reads OpenSearch and Prometheus sources by name, with a Prometheus region', () => {
    expect(
      datasourceCellLines(
        row({ datasourceId: 'os-1', datasourceType: 'opensearch' }),
        new Map(),
        dsById
      )
    ).toEqual(['OpenSearch • Local Cluster', undefined]);
    expect(
      datasourceCellLines(
        row({ datasourceId: 'prom-1', datasourceType: 'prometheus' }),
        new Map(),
        dsById
      )
    ).toEqual(['Prometheus • prod-amp-workspace', 'us-west-2']);
  });
});
describe('monitors_table_columns Name cell icon', () => {
  const renderName = (item: Partial<UnifiedRuleSummary>, cloudWatchIconType?: string) => {
    const cols = buildTableColumns({
      ...baseParams,
      visibleColumns: new Set(['name']),
      cloudWatchIconType,
    });
    const col = cols.find((c) => c.field === 'name') as {
      render: (v: unknown, item: UnifiedRuleSummary) => React.ReactNode;
    };
    const row = { id: 'rule-1', name: 'cpu', ...item } as UnifiedRuleSummary;
    return render(<div>{col.render(row.name, row)}</div>);
  };
  it('shows the given CloudWatch logo on a CloudWatch row', () => {
    const { container } = renderName(
      { datasourceType: 'cloudwatch' },
      '/plugins/workspace/assets/cloudwatch_logo.svg'
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/plugins/workspace/assets/cloudwatch_logo.svg'
    );
  });
  it('falls back to the AWS logo, and other types keep their logo', () => {
    expect(renderName({ datasourceType: 'cloudwatch' }).container.querySelector('img')).toBeNull();
    const prom = renderName(
      { datasourceType: 'prometheus' },
      '/plugins/workspace/assets/cloudwatch_logo.svg'
    );
    expect(prom.container.querySelector('img')).toBeNull();
  });
});
