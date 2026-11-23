/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, within } from '@testing-library/react';
import { buildTableColumns } from '../monitors_table_columns';
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

  it('renders severity as an outlined neutral tag, Critical dark filled', () => {
    const medium = renderCell('severity', 'medium');
    expect(medium.getByTestId('rulesTableSeverity').className).toMatch(/euiBadge--hollow/);
    medium.unmount();
    const critical = renderCell('severity', 'critical');
    expect(critical.getByTestId('rulesTableSeverity')).toHaveTextContent('Critical');
    expect(critical.getByTestId('rulesTableSeverity').className).not.toMatch(/euiBadge--hollow/);
  });
  it('passes AD/forecaster lifecycle statuses through unchanged', () => {
    // These arrive already display-ready; re-casing them would corrupt the
    // wording, so the label getter must leave them alone.
    const { getByText } = renderCell('status', 'Awaiting data to init');
    expect(getByText('Awaiting data to init')).toBeInTheDocument();
  });
});

describe('monitors_table_columns native status words', () => {
  const statusCell = (rule: Partial<UnifiedRuleSummary>) => {
    const cols = buildTableColumns({ ...baseParams, visibleColumns: new Set(['status']) });
    const col = cols.find((c) => c.field === 'status') as {
      render: (v: unknown, item: UnifiedRuleSummary) => React.ReactNode;
    };
    const item = { id: 'rule-1', ...rule } as UnifiedRuleSummary;
    return render(<div>{col.render(item.status, item)}</div>);
  };
  it('reads "Enabled" for an active OpenSearch rule, as a blue dot, not a breach', () => {
    const { getByText, queryByText, getByTestId } = statusCell({
      datasourceType: 'opensearch',
      status: 'active',
    });
    expect(getByText('Enabled')).toBeInTheDocument();
    expect(queryByText('Active')).toBeNull();
    expect(getByTestId('rulesTableStatus')).not.toHaveAttribute('data-breached');
  });
  it('reads Firing as the red tag and Pending / Inactive as dots for Prometheus', () => {
    const firing = statusCell({ datasourceType: 'prometheus', status: 'active' });
    expect(firing.getByText('Firing')).toBeInTheDocument();
    expect(firing.getByTestId('rulesTableStatus')).toHaveAttribute('data-breached', 'true');
    firing.unmount();
    const pending = statusCell({ datasourceType: 'prometheus', status: 'pending' });
    expect(pending.getByText('Pending')).toBeInTheDocument();
    expect(pending.getByTestId('rulesTableStatus')).not.toHaveAttribute('data-breached');
    pending.unmount();
    const inactive = statusCell({ datasourceType: 'prometheus', status: 'muted' });
    expect(inactive.getByText('Inactive')).toBeInTheDocument();
    expect(inactive.queryByText('Muted')).toBeNull();
  });
  it('reads OK for a CloudWatch alarm in OK, with no CW: chip', () => {
    const { getByText, queryByText } = statusCell({
      datasourceType: 'cloudwatch',
      status: 'ok',
      cloudWatch: { state: 'OK', alarmType: 'metric' },
    });
    expect(getByText('OK')).toBeInTheDocument();
    expect(queryByText(/CW:/)).toBeNull();
  });
});
describe('monitors_table_columns headers', () => {
  it('heads the data source column "Data source"', () => {
    const cols = buildTableColumns({ ...baseParams, visibleColumns: new Set(['datasource']) });
    const col = cols.find((c) => c.field === 'datasourceId');
    expect(col?.name).toBe('Data source');
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

  it('shows the current state when the window ends now, once, in CloudWatch words', () => {
    const { getByText, queryByText, getByTestId } = cell('status');
    expect(getByText('In alarm')).toBeInTheDocument();
    expect(queryByText(/CW:/)).toBeNull();
    expect(queryByText('Active')).toBeNull();
    // In alarm is a breach: the filled red tag, not a dot.
    expect(getByTestId('rulesTableStatus')).toHaveAttribute('data-breached', 'true');
  });

  it('shows the state at the window end in Status and Health', () => {
    const at = {
      state: 'INSUFFICIENT_DATA' as const,
      atMs: Date.now() - 86_400_000,
      complete: true,
    };
    const status = cell('status', () => at);
    expect(status.getAllByText('Insufficient data')).toHaveLength(1);
    expect(status.queryByText(/CW:/)).toBeNull();
    expect(status.getByTestId('cloudWatchStatusAtWindowEnd')).not.toHaveAttribute('data-breached');
    status.unmount();
    expect(cell('healthStatus', () => at).getByText('No data')).toBeInTheDocument();
  });

  it("says No history when the window end is older than CloudWatch's history", () => {
    const at = { atMs: Date.now() - 200 * 86_400_000, complete: true };
    const status = cell('status', () => at);
    expect(status.getByTestId('cloudWatchStatusUnknownAtWindowEnd')).toHaveTextContent(
      'No history'
    );
    expect(status.queryByText('In alarm')).toBeNull();
    status.unmount();
    expect(cell('healthStatus', () => at).getByText('—')).toBeInTheDocument();
  });
});

describe('monitors_table_columns Data source cell', () => {
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
  const row = (over: Partial<UnifiedRuleSummary>) =>
    ({ id: 'rule-1', name: 'r', ...over }) as unknown as UnifiedRuleSummary;
  const datasourceColumn = (byId = dsById) =>
    buildTableColumns({
      ...baseParams,
      dsById: byId,
      visibleColumns: new Set(['datasource']),
    }).find((c) => c.field === 'datasourceId') as {
      render: (v: unknown, item: UnifiedRuleSummary) => React.ReactNode;
      sortable: (item: UnifiedRuleSummary) => string;
    };
  const renderDs = (item: UnifiedRuleSummary, byId = dsById) => {
    const { container } = render(
      <div>{datasourceColumn(byId).render(item.datasourceId, item)}</div>
    );
    const { getByTestId, queryByTestId } = within(container);
    const tag = getByTestId('rulesTableDatasource');
    return {
      label: tag.querySelector('.euiBadge')?.textContent,
      detail: queryByTestId('rulesTableDatasource-detail')?.textContent,
      title: tag.getAttribute('data-title'),
    };
  };

  it('shows a cross-account CloudWatch scope once, as the filter names it', () => {
    expect(
      renderDs(
        row({
          datasourceId: 'cloudwatch_us-east-1_prod',
          datasourceType: 'cloudwatch',
          cloudWatch: {
            state: 'ALARM',
            alarmType: 'metric',
            accountId: '444455556666',
            region: 'us-east-1',
          },
        })
      )
    ).toEqual({
      label: 'Prod account',
      detail: 'Cross-account · us-east-1',
      title: 'CloudWatch · account 444455556666',
    });
  });

  it('reads the own CloudWatch account as "This account" with the region below', () => {
    expect(
      renderDs(
        row({
          datasourceId: 'cloudwatch',
          datasourceType: 'cloudwatch',
          cloudWatch: { state: 'OK', alarmType: 'metric', region: 'us-west-2' },
        })
      )
    ).toEqual({ label: 'This account', detail: 'us-west-2', title: 'CloudWatch' });
  });

  it('reads OpenSearch and Prometheus sources by name, with a Prometheus region', () => {
    expect(renderDs(row({ datasourceId: 'os-1', datasourceType: 'opensearch' }))).toEqual({
      label: 'Local Cluster',
      detail: undefined,
      title: 'OpenSearch',
    });
    expect(renderDs(row({ datasourceId: 'prom-1', datasourceType: 'prometheus' }))).toEqual({
      label: 'prod-amp-workspace',
      detail: 'us-west-2',
      title: 'Prometheus',
    });
  });

  it('sorts by the tag text', () => {
    const col = datasourceColumn();
    expect(col.sortable(row({ datasourceId: 'os-1', datasourceType: 'opensearch' }))).toBe(
      'local cluster'
    );
    expect(
      col.sortable(row({ datasourceId: 'cloudwatch_us-east-1_prod', datasourceType: 'cloudwatch' }))
    ).toBe('prod account');
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
