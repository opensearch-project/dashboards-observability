/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { SloDetailPage } from '../slo_detail_page';
import type { RepairResponse, RuleHealthResponse, SloApiClient } from '../slo_api_client';
import type {
  SloDocument,
  SloLiveStatus,
  SloHealthState,
} from '../../../../../../common/slo/slo_types';

// The chart + metadata subtrees hit portals, SQL fetches, and chrome services
// that aren't wired in jsdom. Stub them so the detail page mounts cleanly and
// we can focus the assertions on the callout + accordion under test.
jest.mock('../../../../../plugin_helpers/plugin_headerControl', () => ({
  HeaderControlledComponentsWrapper: ({ components }: { components: React.ReactNode[] }) => (
    <div data-test-subj="header-wrapper">{components}</div>
  ),
}));
jest.mock('../slo_visualizations', () => ({
  SloVisualizations: () => <div data-test-subj="slosVisualizationsStub" />,
}));
jest.mock('../slo_metadata_panel', () => ({
  SloMetadataPanel: () => <div data-test-subj="slosMetadataPanelStub" />,
}));
jest.mock('../slo_alerts_panel', () => ({
  SloAlertsPanel: () => <div data-test-subj="slosAlertsPanelStub" />,
}));

type FullDoc = SloDocument & { liveStatus: SloLiveStatus };

function makeDoc(
  overrides: {
    liveStatusState?: SloHealthState;
    recordingFingerprints?: Record<string, string>;
  } = {}
): FullDoc {
  const liveStatus: SloLiveStatus = {
    sloId: 'slo-1',
    objectives: [
      {
        objectiveName: 'obj-1',
        currentValue: 0.995,
        currentValueUnit: 'ratio',
        attainment: 0.995,
        errorBudgetRemaining: 0.5,
        state: overrides.liveStatusState ?? 'ok',
      },
    ],
    state: overrides.liveStatusState ?? 'ok',
    firingCount: 0,
    ruleCount: 3,
    computedAt: '2026-04-28T00:00:00Z',
  };
  return {
    id: 'slo-1',
    spec: {
      datasourceId: 'ds-1',
      name: 'api-availability',
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
        dimensions: [{ name: 'service', value: 'api' }],
      },
      objectives: [{ name: 'obj-1', target: 0.99 }],
      budgetWarningThresholds: [],
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
        noData: { enabled: false, forDuration: '15m' },
        resolved: { enabled: false },
      },
      exclusionWindows: [],
      labels: {},
      annotations: {},
    },
    status: {
      version: 1,
      createdAt: '2026-04-01T00:00:00Z',
      createdBy: 'tester',
      updatedAt: '2026-04-01T00:00:00Z',
      updatedBy: 'tester',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: 'slo:alerts:slo-api-availability',
        rulerNamespace: 'slo-api-availability',
        recordingFingerprints: overrides.recordingFingerprints ?? { 'obj-1': 'abcd1234' },
      },
    },
    liveStatus,
  };
}

function makeHealth(overrides: Partial<RuleHealthResponse> = {}): RuleHealthResponse {
  return {
    sloId: 'slo-1',
    state: 'ok',
    expectedGroups: ['grp-a', 'grp-b'],
    presentGroups: ['grp-a', 'grp-b'],
    missingGroups: [],
    computedAt: '2026-04-28T00:00:00Z',
    ...overrides,
  };
}

interface MockClient {
  get: jest.Mock;
  delete: jest.Mock;
  enable: jest.Mock;
  disable: jest.Mock;
  repair: jest.Mock;
  getRuleHealth: jest.Mock;
}

function renderPage(
  clientOverrides: Partial<MockClient> = {}
): { client: MockClient; notifications: { toasts: { [k: string]: jest.Mock } } } {
  const client: MockClient = {
    get: jest.fn(),
    delete: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    repair: jest.fn(),
    getRuleHealth: jest.fn().mockResolvedValue(makeHealth()),
    ...clientOverrides,
  };
  const notifications = {
    toasts: {
      addSuccess: jest.fn(),
      addDanger: jest.fn(),
      addWarning: jest.fn(),
      addInfo: jest.fn(),
      addError: jest.fn(),
    },
  };
  const chrome = { setBreadcrumbs: jest.fn() };

  render(
    <MemoryRouter initialEntries={['/slos/slo-1']}>
      <Route path="/slos/:id">
        <SloDetailPage
          apiClient={(client as unknown) as SloApiClient}
          chrome={(chrome as unknown) as Parameters<typeof SloDetailPage>[0]['chrome']}
          notifications={
            (notifications as unknown) as Parameters<typeof SloDetailPage>[0]['notifications']
          }
          parentBreadcrumb={{ text: 'APM', href: '#/' }}
        />
      </Route>
    </MemoryRouter>
  );
  return { client, notifications };
}

describe('SloDetailPage — rule-health callout', () => {
  it('renders the danger callout with Restore + Delete when liveStatus is rules_missing and health is rules_missing', async () => {
    const doc = makeDoc({ liveStatusState: 'rules_missing' });
    const health = makeHealth({
      state: 'rules_missing',
      missingGroups: ['grp-a', 'grp-b'],
      presentGroups: [],
    });
    const { client } = renderPage({
      get: jest.fn().mockResolvedValue(doc),
      getRuleHealth: jest.fn().mockResolvedValue(health),
    });

    const callout = await screen.findByTestId('slosDetailRuleHealthCallout');
    expect(callout).toHaveTextContent(/Rule groups missing in Cortex/i);
    expect(callout).toHaveTextContent(/2 of 2 expected rule groups/i);
    expect(screen.getByTestId('slosDetailRestore')).toBeInTheDocument();
    expect(screen.getByTestId('slosDetailBrokenDelete')).toBeInTheDocument();
    expect(client.getRuleHealth).toHaveBeenCalledWith('slo-1');
  });

  it('hides the callout after Restore when follow-up rule-health returns ok', async () => {
    const missingDoc = makeDoc({ liveStatusState: 'rules_missing' });
    const healthyDoc = makeDoc({ liveStatusState: 'ok' });
    const get = jest.fn().mockResolvedValueOnce(missingDoc).mockResolvedValueOnce(healthyDoc);
    const repairResponse: RepairResponse = {
      sloId: 'slo-1',
      repaired: true,
      health: makeHealth({ state: 'ok' }),
    };
    const repair = jest.fn().mockResolvedValue(repairResponse);
    const getRuleHealth = jest
      .fn()
      .mockResolvedValueOnce(makeHealth({ state: 'rules_missing', missingGroups: ['x'] }));

    const { notifications } = renderPage({ get, repair, getRuleHealth });

    await screen.findByTestId('slosDetailRuleHealthCallout');

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosDetailRestore'));
    });

    await waitFor(() => {
      expect(repair).toHaveBeenCalledWith('slo-1');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('slosDetailRuleHealthCallout')).not.toBeInTheDocument();
    });
    expect(notifications.toasts.addSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/Restored 2 rule groups/) })
    );
  });

  it('shows the "already present" info toast when repair returns repaired:false', async () => {
    const doc = makeDoc({ liveStatusState: 'rules_missing' });
    const repair = jest.fn().mockResolvedValue({
      sloId: 'slo-1',
      repaired: false,
      health: makeHealth({ state: 'ok' }),
    } as RepairResponse);
    const getRuleHealth = jest
      .fn()
      .mockResolvedValueOnce(makeHealth({ state: 'rules_missing', missingGroups: ['x'] }));

    const { notifications } = renderPage({
      get: jest.fn().mockResolvedValue(doc),
      repair,
      getRuleHealth,
    });
    await screen.findByTestId('slosDetailRestore');

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosDetailRestore'));
    });

    await waitFor(() => {
      expect(notifications.toasts.addInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/already present/i),
        })
      );
    });
  });

  it('opens the confirm-delete modal when the callout Delete button is clicked', async () => {
    const doc = makeDoc({ liveStatusState: 'rules_missing' });
    renderPage({
      get: jest.fn().mockResolvedValue(doc),
      getRuleHealth: jest
        .fn()
        .mockResolvedValue(makeHealth({ state: 'rules_missing', missingGroups: ['x'] })),
    });

    await screen.findByTestId('slosDetailBrokenDelete');
    fireEvent.click(screen.getByTestId('slosDetailBrokenDelete'));

    expect(await screen.findByText(/Delete SLO "api-availability"\?/)).toBeInTheDocument();
  });

  it('renders a ruler-unreachable warning callout with a Retry button that re-calls getRuleHealth', async () => {
    const doc = makeDoc({ liveStatusState: 'ok' });
    const getRuleHealth = jest
      .fn()
      .mockResolvedValue(
        makeHealth({ state: 'ruler_unreachable', rulerErrorCode: 'RULER_UNREACHABLE' })
      );
    renderPage({ get: jest.fn().mockResolvedValue(doc), getRuleHealth });

    const callout = await screen.findByTestId('slosDetailRuleHealthCallout');
    expect(callout).toHaveTextContent(/Ruler unreachable/i);
    expect(callout).toHaveTextContent(/RULER_UNREACHABLE/);

    const retry = screen.getByTestId('slosDetailRuleHealthRetry');
    await act(async () => {
      fireEvent.click(retry);
    });

    await waitFor(() => {
      expect(getRuleHealth).toHaveBeenCalledTimes(2);
    });
  });

  it('renders no callout when liveStatus.state is ok and ruleHealth.state is ok', async () => {
    const doc = makeDoc({ liveStatusState: 'ok' });
    renderPage({
      get: jest.fn().mockResolvedValue(doc),
      getRuleHealth: jest.fn().mockResolvedValue(makeHealth({ state: 'ok' })),
    });

    // Wait for the page to finish loading + rule-health to resolve. The header
    // is a reliable signal because it mounts on the same cycle.
    await screen.findByTestId('slosDetailHeader');
    await waitFor(() => {
      expect(screen.queryByTestId('slosDetailRuleHealthCallout')).not.toBeInTheDocument();
    });
  });
});

describe('SloDetailPage — Recording rules accordion', () => {
  it('renders one code block per recording window × unique fingerprint', async () => {
    const doc = makeDoc({
      recordingFingerprints: { 'obj-1': 'abcd1234' },
    });
    renderPage({ get: jest.fn().mockResolvedValue(doc) });

    expect(await screen.findByTestId('slosDetailRecordingRulesAccordion')).toBeInTheDocument();

    // 7 recording windows expand into 7 code blocks for a single fingerprint.
    const rules = [0, 1, 2].map((i) => screen.getByTestId(`slosDetailRecordingRule-${i}`));
    expect(rules[0]).toHaveTextContent('slo:sli_error:ratio_rate_5m:sli_abcd1234');
    expect(rules[1]).toHaveTextContent('slo:sli_error:ratio_rate_30m:sli_abcd1234');
    expect(rules[2]).toHaveTextContent('slo:sli_error:ratio_rate_1h:sli_abcd1234');
  });
});
