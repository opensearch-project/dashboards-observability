/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

// The flyout shows which row it was opened on.
jest.mock('../monitor_detail_flyout', () => ({
  MonitorDetailFlyout: ({ monitor }: { monitor: { datasourceId: string } }) => (
    <div data-test-subj="monitorFlyout">{`flyout:${monitor.datasourceId}`}</div>
  ),
}));
jest.mock('../detector_detail_flyout', () => ({ DetectorDetailFlyout: () => null }));
jest.mock('../forecaster_detail_flyout', () => ({ ForecasterDetailFlyout: () => null }));

import { MonitorsTable } from '../monitors_table';
import type { Datasource, UnifiedRuleSummary } from '../../../../common/types/alerting';

// One alarm read through two account scopes: two rows with the same id (its ARN), one per
// datasource.
const row = (datasourceId: string): UnifiedRuleSummary =>
  ({
    id: 'arn:alarm:checkout-errors',
    name: 'checkout-errors',
    enabled: true,
    status: 'active',
    severity: 'high',
    monitorType: 'metric',
    healthStatus: 'healthy',
    datasourceId,
    datasourceType: 'prometheus',
    query: 'x > 1',
    condition: '',
    labels: {},
    annotations: {},
    createdBy: '',
    notificationDestinations: [],
    evaluationInterval: '1m',
    pendingPeriod: '0s',
  }) as unknown as UnifiedRuleSummary;

const datasources = [
  { id: 'ds-own', name: 'own', type: 'prometheus' },
  { id: 'ds-scope', name: 'scope', type: 'prometheus' },
] as unknown as Datasource[];

const props = {
  datasources,
  loading: false,
  onDelete: jest.fn(),
  selectedDsIds: ['ds-own', 'ds-scope'],
  onDatasourceChange: jest.fn(),
  maxDatasources: 5,
  onDatasourceCapReached: jest.fn(),
};

describe('MonitorsTable selected row', () => {
  it('keeps the flyout on the clicked row when another row has the same id', () => {
    const view = render(<MonitorsTable {...props} rules={[row('ds-own'), row('ds-scope')]} />);
    fireEvent.click(screen.getAllByText('checkout-errors')[1]);
    expect(screen.getByTestId('monitorFlyout')).toHaveTextContent('flyout:ds-scope');
    // A refresh hands down new row objects: the flyout still follows the same row.
    act(() => {
      view.rerender(<MonitorsTable {...props} rules={[row('ds-own'), row('ds-scope')]} />);
    });
    expect(screen.getByTestId('monitorFlyout')).toHaveTextContent('flyout:ds-scope');
  });
});
