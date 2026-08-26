/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Edit-path coverage for the SLO wizard (BUG-S3). Each test is written so it
 * FAILS if the corresponding production change is reverted:
 *   - the `#/slos/:id/edit` route resolves and renders the wizard prefilled
 *   - submitting on the edit route calls `update` (not `create`) — no duplicate
 *   - the datasource is not silently editable in edit mode (key field)
 *   - the create route still starts from an empty form
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { SloWizardPage } from '../slo_wizard_page';
import { SlosPage } from '../slos_page';
import type { SloApiClient } from '../slo_api_client';
import type { SloDocument } from '../../../../../../common/slo/slo_types';
import { OBSERVABILITY_BASE } from '../../../../../../common/constants/shared';

jest.useFakeTimers();

// HeaderControlledComponentsWrapper reaches into OSD's chrome pipeline (unwired
// in jsdom). Render its children inline so the wizard body still mounts.
jest.mock('../../../../../plugin_helpers/plugin_headerControl', () => ({
  HeaderControlledComponentsWrapper: ({ components }: { components: React.ReactNode[] }) => (
    <div data-test-subj="header-wrapper">{components}</div>
  ),
}));

// Datasource + metadata hooks reach coreRefs.http / savedObjectsClient. Stub
// them to inert shapes so the wizard renders without live services.
jest.mock('../../../../alerting/hooks/use_datasources', () => ({
  useDatasources: () => ({
    datasources: [
      {
        id: 'ds-2',
        name: 'Prod Prometheus',
        type: 'prometheus',
        url: 'prom_conn',
        enabled: true,
        directQueryName: 'prom_conn',
      },
    ],
    isLoading: false,
    error: null,
    refresh: () => {},
  }),
}));
jest.mock('../../../../alerting/hooks/use_prometheus_metadata', () => ({
  usePrometheusMetadata: () => ({
    metricOptions: [],
    metricsLoading: false,
    searchMetrics: jest.fn(),
    labelNames: [],
    labelNamesLoading: false,
    labelValues: {},
    labelValuesLoading: {},
    fetchLabelValues: jest.fn(),
    metricMetadata: [],
    error: false,
    applyTemplate: jest.fn(),
  }),
}));

// The sibling pages are heavy and irrelevant to these assertions. Stub them so
// the route-resolution test can prove the WIZARD renders on `/slos/:id/edit`
// (and would render the listing stub instead if the route were removed).
jest.mock('../slo_listing_page', () => ({
  SloListingPage: () => <div data-test-subj="slosListingStub" />,
}));
jest.mock('../slo_suggest_page', () => ({
  SloSuggestPage: () => <div data-test-subj="slosSuggestStub" />,
}));
jest.mock('../slo_detail_page', () => ({
  SloDetailPage: () => <div data-test-subj="slosDetailStub" />,
}));

const SLO_BASE = `${OBSERVABILITY_BASE}/v1/slos`;

function makeDoc(): SloDocument {
  return {
    id: 'slo-1',
    spec: {
      datasourceId: 'prom_conn',
      name: 'api-availability',
      description: 'checkout availability',
      enabled: true,
      mode: 'active',
      service: 'checkout',
      owner: { teams: ['sre'], primaryUser: 'alice' },
      tier: 'tier-1',
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'http_requests_total',
          goodEventsFilter: 'status!~"5.."',
        },
        dimensions: [{ name: 'service', value: 'checkout' }],
      },
      objectives: [{ name: 'obj-1', target: 0.99 }],
      budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
      window: { type: 'rolling', duration: '28d' },
      alerting: {
        strategy: 'mwmbr',
        burnRates: [
          {
            shortWindow: '5m',
            longWindow: '1h',
            burnRateMultiplier: 14,
            severity: 'page',
            createAlarm: true,
            forDuration: '2m',
          },
        ],
      },
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
    },
    status: {
      version: 3,
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'tester',
      updatedAt: '2026-01-01T00:00:00Z',
      updatedBy: 'tester',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: 'slo:alerts:api',
        rulerNamespace: 'slo-generated-prom',
        recordingFingerprints: { 'obj-1': 'abcd1234' },
      },
    },
  };
}

function makeClient(overrides: Partial<SloApiClient> = {}): Partial<SloApiClient> {
  return {
    get: jest.fn().mockResolvedValue(makeDoc()),
    update: jest.fn().mockImplementation((id: string, input: { version: number }) =>
      Promise.resolve({
        ...makeDoc(),
        status: { ...makeDoc().status, version: input.version + 1 },
      })
    ),
    create: jest.fn(),
    preview: jest.fn().mockResolvedValue({ groupName: 'g', interval: 30, rules: [], yaml: '' }),
    list: jest.fn().mockResolvedValue({ results: [], total: 0 }),
    labelValues: jest.fn().mockResolvedValue({ values: [] }),
    ...overrides,
  };
}

function makeChrome() {
  return { setBreadcrumbs: jest.fn() } as unknown as Parameters<typeof SloWizardPage>[0]['chrome'];
}
function makeNotifications() {
  return {
    toasts: { addSuccess: jest.fn(), addWarning: jest.fn(), addDanger: jest.fn() },
  } as unknown as Parameters<typeof SloWizardPage>[0]['notifications'];
}

function renderEditWizard(apiClient: Partial<SloApiClient>) {
  return render(
    <MemoryRouter initialEntries={['/slos/slo-1/edit']}>
      <Route path="/slos/:id/edit">
        <SloWizardPage
          apiClient={apiClient as SloApiClient}
          chrome={makeChrome()}
          notifications={makeNotifications()}
          parentBreadcrumb={{ text: 'APM', href: '#/' }}
          editSloId="slo-1"
        />
      </Route>
    </MemoryRouter>
  );
}

/** Flush the async edit-load (apiClient.get) + any queued timers. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
}

describe('SLO wizard — edit path (BUG-S3)', () => {
  it('resolves the #/slos/:id/edit route and renders the wizard prefilled from the doc', async () => {
    // Drive the REAL router in SlosPage via an http mock so this fails if the
    // `/slos/:id/edit` route is removed (it would redirect to the listing stub).
    const httpGet = jest.fn((url: string) => {
      if (url === `${SLO_BASE}/slo-1`) return Promise.resolve(makeDoc());
      if (url === SLO_BASE) return Promise.resolve({ results: [], total: 0 });
      return Promise.resolve({ values: [] });
    });
    const http = {
      get: httpGet,
      post: jest.fn().mockResolvedValue({ groupName: 'g', interval: 30, rules: [], yaml: '' }),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as Parameters<typeof SlosPage>[0]['http'];

    window.location.hash = '#/slos/slo-1/edit';
    render(
      <SlosPage
        http={http}
        chrome={makeChrome()}
        notifications={makeNotifications()}
        parentBreadcrumb={{ text: 'APM', href: '#/' }}
      />
    );
    await flush();

    // The wizard (not the listing) rendered, prefilled with the saved name.
    expect(screen.getByTestId('slosWizardName')).toHaveValue('api-availability');
    expect(screen.queryByTestId('slosListingStub')).toBeNull();
    window.location.hash = '';
  });

  it('submitting on the edit route calls update (not create) — no duplicate SLO', async () => {
    const apiClient = makeClient();
    renderEditWizard(apiClient);
    await flush();

    // Prefill sanity — the form is populated before we submit.
    expect(screen.getByTestId('slosWizardName')).toHaveValue('api-availability');

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosWizardSubmit'));
    });
    await flush();

    await waitFor(() => expect(apiClient.update).toHaveBeenCalledTimes(1));
    const [calledId, calledInput] = (apiClient.update as jest.Mock).mock.calls[0];
    expect(calledId).toBe('slo-1');
    // Optimistic-concurrency version echoed from the loaded doc.
    expect(calledInput.version).toBe(3);
    expect(calledInput.spec.name).toBe('api-availability');
    // Crucially: it must NOT create a second SLO.
    expect(apiClient.create).not.toHaveBeenCalled();
  });

  it('renders the datasource as read-only in edit mode (key field not silently editable)', async () => {
    const apiClient = makeClient();
    renderEditWizard(apiClient);
    await flush();

    // The read-only field is shown, prefilled with the persisted datasource...
    const readOnly = screen.getByTestId('slosWizardDatasourceReadOnly');
    expect(readOnly).toHaveValue('prom_conn');
    expect(readOnly).toBeDisabled();
    // ...and the interactive datasource picker is NOT rendered.
    expect(screen.queryByTestId('slosWizardDatasourceId')).toBeNull();
  });

  it('the create route still starts from an empty form', () => {
    const apiClient = makeClient();
    render(
      <MemoryRouter initialEntries={['/slos/create/http-availability']}>
        <Route path="/slos/create/:templateId">
          <SloWizardPage
            apiClient={apiClient as SloApiClient}
            chrome={makeChrome()}
            notifications={makeNotifications()}
            parentBreadcrumb={{ text: 'APM', href: '#/' }}
          />
        </Route>
      </MemoryRouter>
    );

    // No prefill: the name starts blank, and the interactive datasource picker
    // (not the read-only field) is shown.
    expect(screen.getByTestId('slosWizardName')).toHaveValue('');
    expect(screen.getByTestId('slosWizardDatasourceId')).toBeInTheDocument();
    expect(screen.queryByTestId('slosWizardDatasourceReadOnly')).toBeNull();
    // The edit-only load path never fires for create.
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
