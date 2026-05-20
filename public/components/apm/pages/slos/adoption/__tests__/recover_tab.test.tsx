/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecoverTab } from '../recover_tab';
import type { OrphanCandidate, OrphanListResponse, SloApiClient } from '../../slo_api_client';
import type { SloSpec } from '../../../../../../../common/slo/slo_types';

function makeSpec(name: string): SloSpec {
  return {
    datasourceId: 'prom-ds-001',
    name,
    enabled: true,
    mode: 'active',
    service: 'api',
    owner: { teams: ['sre'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [],
    },
    objectives: [{ name: 'obj-1', target: 0.999 }],
    budgetWarningThresholds: [],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: [] },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: true },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
  };
}

function makeCandidate(overrides: Partial<OrphanCandidate>): OrphanCandidate {
  return {
    sloId: 'slo-a',
    datasourceId: 'ds-1',
    workspaceId: 'ws-1',
    namespace: 'ns-1',
    groupName: 'slo:alerts:slo-a',
    spec: makeSpec('slo-a-name'),
    specSha256: 'sha-1',
    specIntegrity: 'ok',
    fingerprints: ['fp-1'],
    tombstoned: false,
    ...overrides,
  };
}

function makeInitial(): OrphanListResponse {
  return {
    candidates: [
      makeCandidate({ sloId: 'ok-1', spec: makeSpec('Ok One') }),
      makeCandidate({ sloId: 'ok-2', spec: makeSpec('Ok Two') }),
      makeCandidate({
        sloId: 'tomb-1',
        spec: makeSpec('Tombstoned One'),
        tombstoned: true,
        tombstoneCreatedAt: '2025-06-10T00:00:00Z',
      }),
    ],
    unknowns: [
      {
        datasourceId: 'ds-1',
        namespace: 'ns-1',
        groupName: 'alien-group-1',
        diagnostic: 'no sloId',
      },
      { datasourceId: 'ds-1', namespace: 'ns-1', groupName: 'alien-group-2' },
    ],
  };
}

function renderTab(
  apiClient: jest.Mocked<SloApiClient>,
  initialData: OrphanListResponse = makeInitial()
) {
  const notifications = {
    toasts: {
      addSuccess: jest.fn(),
      addDanger: jest.fn(),
      addWarning: jest.fn(),
    },
  };
  return render(
    <RecoverTab
      apiClient={apiClient}
      notifications={
        (notifications as unknown) as Parameters<typeof RecoverTab>[0]['notifications']
      }
      initialData={initialData}
    />
  );
}

function makeApiClient(): jest.Mocked<SloApiClient> {
  return ({
    listOrphans: jest.fn().mockResolvedValue(makeInitial()),
    recoverSlo: jest.fn().mockResolvedValue({
      slo: { id: 'ok-1' },
      tombstoneCleared: false,
      refcountChanges: [],
    }),
  } as unknown) as jest.Mocked<SloApiClient>;
}

describe('RecoverTab', () => {
  it('renders the table with the seeded candidates and an unknowns accordion', () => {
    renderTab(makeApiClient());
    expect(screen.getByTestId('sloAdoption-recoverTab-table')).toBeInTheDocument();
    expect(screen.getByText('Ok One')).toBeInTheDocument();
    expect(screen.getByText('Ok Two')).toBeInTheDocument();
    expect(screen.getByText('Tombstoned One')).toBeInTheDocument();
    expect(screen.getByTestId('sloAdoption-recoverTab-unknownsAccordion')).toBeInTheDocument();
  });

  it('calls recoverSlo without acknowledgeTombstone for an ok row', async () => {
    const api = makeApiClient();
    renderTab(api);
    await act(async () => {
      fireEvent.click(screen.getByTestId('sloAdoption-recoverTab-recoverButton-ok-1'));
    });
    await waitFor(() => {
      expect(api.recoverSlo).toHaveBeenCalledWith({
        sloId: 'ok-1',
        datasourceId: 'ds-1',
        workspaceId: 'ws-1',
        acknowledgeTombstone: undefined,
      });
    });
  });

  it('opens the tombstone modal first and fires recover with acknowledgeTombstone: true after confirm', async () => {
    const api = makeApiClient();
    renderTab(api);
    // Tombstone badge opens the confirmation modal.
    fireEvent.click(screen.getByTestId('sloAdoption-tombstoneBadge-tomb-1'));
    expect(screen.getByText(/This SLO was deliberately deleted/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('sloAdoption-tombstoneBadge-confirm-tomb-1'));
    });
    await waitFor(() => {
      expect(api.recoverSlo).toHaveBeenCalledWith({
        sloId: 'tomb-1',
        datasourceId: 'ds-1',
        workspaceId: 'ws-1',
        acknowledgeTombstone: true,
      });
    });
  });

  it('dismisses a row and restores it via the Show dismissed toggle', async () => {
    renderTab(makeApiClient());
    // Dismiss one of the ok rows.
    fireEvent.click(screen.getByTestId('sloAdoption-recoverTab-dismissButton-ok-1'));
    await waitFor(() => {
      expect(screen.queryByText('Ok One')).not.toBeInTheDocument();
    });
    // "Show dismissed" toggle appears once something is dismissed.
    fireEvent.click(screen.getByTestId('sloAdoption-recoverTab-showDismissed'));
    await waitFor(() => {
      expect(screen.getByText('Ok One')).toBeInTheDocument();
    });
  });

  it('surfaces a row-level error callout when recoverSlo rejects', async () => {
    const api = makeApiClient();
    (api.recoverSlo as jest.Mock).mockRejectedValueOnce({
      body: { message: 'backend exploded' },
    });
    renderTab(api);
    await act(async () => {
      fireEvent.click(screen.getByTestId('sloAdoption-recoverTab-recoverButton-ok-1'));
    });
    await waitFor(() => {
      expect(screen.getByText('backend exploded')).toBeInTheDocument();
    });
  });
});
