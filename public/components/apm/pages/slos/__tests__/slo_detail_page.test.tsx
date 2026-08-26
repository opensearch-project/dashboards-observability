/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import {
  deriveSloCalloutState,
  RULE_HEALTH_MAX_RETRIES,
  RULE_HEALTH_RETRY_INTERVAL_MS,
  SloDetailPage,
} from '../slo_detail_page';
import type { RepairResponse, RuleHealthResponse, SloApiClient } from '../slo_api_client';
import type {
  SloDocument,
  SloLiveStatus,
  SloHealthState,
} from '../../../../../../common/slo/slo_types';
import { observabilityAlertingID } from '../../../../../../common/constants/shared';
import { coreRefs } from '../../../../../framework/core_refs';

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
jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: { application: { navigateToApp: jest.fn() } },
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

function renderPage(clientOverrides: Partial<MockClient> = {}): {
  client: MockClient;
  notifications: { toasts: { [k: string]: jest.Mock } };
} {
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
          apiClient={client as unknown as SloApiClient}
          chrome={chrome as unknown as Parameters<typeof SloDetailPage>[0]['chrome']}
          notifications={
            notifications as unknown as Parameters<typeof SloDetailPage>[0]['notifications']
          }
          parentBreadcrumb={{ text: 'APM', href: '#/' }}
        />
      </Route>
    </MemoryRouter>
  );
  return { client, notifications };
}

// ---- Fake-timer helpers for the re-poll / grace-window tests ---------------
//
// `settle` flushes the promise chains behind the initial `get` +
// `getRuleHealth` (and any state updates they trigger) without moving the
// clock; `advanceOneRetry` fires exactly one bounded re-probe interval.

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
  }
};

const advanceOneRetry = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(RULE_HEALTH_RETRY_INTERVAL_MS);
  });
};

const exhaustRetries = async () => {
  for (let i = 0; i < RULE_HEALTH_MAX_RETRIES; i++) {
    await advanceOneRetry();
  }
  await settle();
};

describe('deriveSloCalloutState', () => {
  it('prefers a concrete rule-health probe state over the live-status flag', () => {
    expect(deriveSloCalloutState('rules_missing', 'ok')).toBe('rules_missing');
    expect(deriveSloCalloutState('rules_partial', 'ok')).toBe('rules_partial');
    expect(deriveSloCalloutState('ruler_unreachable', 'ok')).toBe('ruler_unreachable');
  });

  it('lets a concrete healthy probe win over a stale rules_missing live-status (F-CRUD2)', () => {
    // The fresh-create shape: rules have propagated (probe → ok) but the
    // persisted liveStatus.state hasn't been recomputed yet. The probe must
    // win so the destructive callout never shows on a healthy SLO.
    expect(deriveSloCalloutState('ok', 'rules_missing')).toBeNull();
  });

  it('falls back to the live-status flag only when the probe is absent', () => {
    expect(deriveSloCalloutState(undefined, 'rules_missing')).toBe('rules_missing');
  });

  it('returns null when neither signal indicates a problem', () => {
    expect(deriveSloCalloutState('ok', 'ok')).toBeNull();
    expect(deriveSloCalloutState(undefined, 'breached')).toBeNull();
  });
});

describe('SloDetailPage — not-found / loading / error states', () => {
  it('renders the SLO-not-found empty state when the id resolves to no doc', async () => {
    renderPage({ get: jest.fn().mockResolvedValue(null) });

    const prompt = await screen.findByTestId('slosDetailNotFound');
    expect(prompt).toHaveTextContent(/SLO not found/i);
    expect(prompt).toHaveTextContent(/slo-1/);
    expect(screen.getByTestId('slosDetailNotFoundBack')).toBeInTheDocument();
    // Not the fetch-error branch.
    expect(screen.queryByText(/Unable to load SLO/i)).not.toBeInTheDocument();
  });

  it('routes a 404 rejection to the not-found prompt, not the error branch (CLAR16)', async () => {
    // Production path: apiClient.get rejects with an IHttpFetchError-shaped 404
    // (a deleted SLO / stale deep link) rather than resolving null.
    renderPage({ get: jest.fn().mockRejectedValue({ response: { status: 404 } }) });

    const prompt = await screen.findByTestId('slosDetailNotFound');
    expect(prompt).toHaveTextContent(/SLO not found/i);
    // The raw fetch-error branch must NOT render for a 404.
    expect(screen.queryByText(/Unable to load SLO/i)).not.toBeInTheDocument();
  });

  it('shows the loading spinner (not the not-found prompt) while the fetch is in flight', () => {
    // A never-resolving get keeps the page in its loading state.
    renderPage({ get: jest.fn(() => new Promise<never>(() => undefined)) });

    expect(screen.queryByTestId('slosDetailNotFound')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailHeader')).not.toBeInTheDocument();
  });

  it('renders the fetch-error branch (not the not-found prompt) when get rejects', async () => {
    renderPage({ get: jest.fn().mockRejectedValue(new Error('boom')) });

    expect(await screen.findByText(/Unable to load SLO/i)).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailNotFound')).not.toBeInTheDocument();
  });
});

describe('SloDetailPage — View alerts pivot (OBS1)', () => {
  it('navigates to the alerting app Alerts tab (not the Rules list) scoped to this SLO', async () => {
    const navigateToApp = coreRefs?.application?.navigateToApp as jest.Mock;
    navigateToApp.mockClear();
    renderPage({ get: jest.fn().mockResolvedValue(makeDoc()) });

    const viewAlerts = await screen.findByTestId('slosDetailViewAlerts');
    fireEvent.click(viewAlerts);

    expect(navigateToApp).toHaveBeenCalledWith(
      observabilityAlertingID,
      expect.objectContaining({ path: expect.stringContaining('#/alerts?') })
    );
    const path = navigateToApp.mock.calls[0][1].path as string;
    expect(path).toContain('slo_id%3Aslo-1'); // q=slo_id:slo-1, url-encoded
    expect(path).toContain('ds=ds-1');
    // Regression guard: must not drop the user on the Rules definition list.
    expect(path).not.toContain('#/rules');
  });
});

describe('SloDetailPage — Edit affordance (BUG-S3)', () => {
  it('renders an Edit action linking to the SLO edit route', async () => {
    renderPage({ get: jest.fn().mockResolvedValue(makeDoc()) });

    const editButton = await screen.findByTestId('slosDetailEdit');
    expect(editButton).toHaveAttribute('href', '#/slos/slo-1/edit');
  });
});

describe('SloDetailPage — rule-health grace window + re-poll (F-CRUD2)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows the soft "propagating" callout (no destructive CTA) before retries are exhausted', async () => {
    const { client } = renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'rules_missing' })),
      getRuleHealth: jest
        .fn()
        .mockResolvedValue(
          makeHealth({ state: 'rules_missing', missingGroups: ['grp-a', 'grp-b'] })
        ),
    });

    await settle();

    expect(screen.getByTestId('slosDetailRulePropagatingCallout')).toBeInTheDocument();
    // The alarming callout and its destructive CTAs stay hidden during grace.
    expect(screen.queryByTestId('slosDetailRuleHealthCallout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailRestore')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailBrokenDelete')).not.toBeInTheDocument();
    // The probe fired at least once on mount.
    expect(client.getRuleHealth).toHaveBeenCalledWith('slo-1');
  });

  it('re-polls rule health on the bounded interval while rules read as missing', async () => {
    const getRuleHealth = jest
      .fn()
      .mockResolvedValue(makeHealth({ state: 'rules_missing', missingGroups: ['grp-a'] }));
    renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'rules_missing' })),
      getRuleHealth,
    });

    await settle();
    expect(getRuleHealth).toHaveBeenCalledTimes(1); // initial mount probe

    await advanceOneRetry();
    expect(getRuleHealth).toHaveBeenCalledTimes(2);

    await advanceOneRetry();
    expect(getRuleHealth).toHaveBeenCalledTimes(3);
  });

  it('escalates to the alarming "missing" callout only after retries are exhausted', async () => {
    const getRuleHealth = jest
      .fn()
      .mockResolvedValue(makeHealth({ state: 'rules_missing', missingGroups: ['grp-a', 'grp-b'] }));
    renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'rules_missing' })),
      getRuleHealth,
    });

    await settle();
    expect(screen.getByTestId('slosDetailRulePropagatingCallout')).toBeInTheDocument();

    await exhaustRetries();

    const callout = screen.getByTestId('slosDetailRuleHealthCallout');
    expect(callout).toHaveTextContent(/Rule groups missing in Cortex/i);
    expect(callout).toHaveTextContent(/2 of 2 expected rule groups/i);
    expect(screen.getByTestId('slosDetailRestore')).toBeInTheDocument();
    expect(screen.getByTestId('slosDetailBrokenDelete')).toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailRulePropagatingCallout')).not.toBeInTheDocument();
    // Probing stopped once the budget was spent: one mount probe + MAX retries.
    expect(getRuleHealth).toHaveBeenCalledTimes(RULE_HEALTH_MAX_RETRIES + 1);
    // And it did not keep polling forever.
    await advanceOneRetry();
    expect(getRuleHealth).toHaveBeenCalledTimes(RULE_HEALTH_MAX_RETRIES + 1);
  });

  it('never escalates when rule health recovers during the grace window', async () => {
    // Missing on the first probe, healthy on every re-poll afterwards.
    const getRuleHealth = jest
      .fn()
      .mockResolvedValueOnce(makeHealth({ state: 'rules_missing', missingGroups: ['grp-a'] }))
      .mockResolvedValue(makeHealth({ state: 'ok' }));
    renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'ok' })),
      getRuleHealth,
    });

    await settle();
    expect(screen.getByTestId('slosDetailRulePropagatingCallout')).toBeInTheDocument();

    await advanceOneRetry();
    await settle();

    expect(screen.queryByTestId('slosDetailRulePropagatingCallout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailRuleHealthCallout')).not.toBeInTheDocument();
  });

  it('never escalates on the real fresh-create shape: liveStatus stays rules_missing but the probe recovers to ok', async () => {
    // The scenario F-CRUD2 exists for: the SLO was just created, so the
    // persisted liveStatus.state is still `rules_missing` (server hasn't
    // recomputed), and `doc` is never reloaded by the poll — but the rule-health
    // probe recovers to `ok` once the groups propagate. The concrete healthy
    // probe must win so the destructive alarm never shows.
    const getRuleHealth = jest
      .fn()
      .mockResolvedValueOnce(makeHealth({ state: 'rules_missing', missingGroups: ['grp-a'] }))
      .mockResolvedValue(makeHealth({ state: 'ok' }));
    renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'rules_missing' })),
      getRuleHealth,
    });

    await settle();
    expect(screen.getByTestId('slosDetailRulePropagatingCallout')).toBeInTheDocument();

    await advanceOneRetry();
    await settle();

    expect(screen.queryByTestId('slosDetailRulePropagatingCallout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailRuleHealthCallout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailRestore')).not.toBeInTheDocument();

    // And it must not keep escalating even if we let the full retry budget run.
    await exhaustRetries();
    expect(screen.queryByTestId('slosDetailRuleHealthCallout')).not.toBeInTheDocument();
  });

  it('keeps probing on a stale cached-healthy probe while liveStatus is missing, then escalates once the probe catches up', async () => {
    // Mirrors rule_health.spec Step E: the group was really deleted, but the
    // server-cached rule-health probe (~90s TTL) first returns a stale `ok`
    // while the persisted liveStatus is already `rules_missing`. Polling is
    // driven by liveStatus (not the callout state), so it must keep re-probing
    // until the probe re-reads `rules_missing` and then escalate — rather than
    // trusting the stale healthy probe, going quiet, and never surfacing the
    // genuine "rules missing" alarm.
    const getRuleHealth = jest
      .fn()
      .mockResolvedValueOnce(makeHealth({ state: 'ok' })) // stale cached read
      .mockResolvedValue(makeHealth({ state: 'rules_missing', missingGroups: ['grp-a'] }));
    renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'rules_missing' })),
      getRuleHealth,
    });

    await settle();
    // Stale healthy probe wins the callout (no false alarm), but polling continues.
    expect(screen.queryByTestId('slosDetailRuleHealthCallout')).not.toBeInTheDocument();

    await exhaustRetries();

    // Probe caught up to missing and the budget is spent → escalate.
    expect(screen.getByTestId('slosDetailRuleHealthCallout')).toBeInTheDocument();
    expect(getRuleHealth.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('SloDetailPage — rule-health callout (escalated) actions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('hides the callout after Restore when follow-up rule-health returns ok', async () => {
    const missingDoc = makeDoc({ liveStatusState: 'rules_missing' });
    const healthyDoc = makeDoc({ liveStatusState: 'ok' });
    // Mount fetch returns the broken doc; the post-repair reload returns healthy.
    const get = jest.fn().mockResolvedValueOnce(missingDoc).mockResolvedValue(healthyDoc);
    const repairResponse: RepairResponse = {
      sloId: 'slo-1',
      repaired: true,
      health: makeHealth({ state: 'ok' }),
    };
    const repair = jest.fn().mockResolvedValue(repairResponse);
    const getRuleHealth = jest
      .fn()
      .mockResolvedValue(makeHealth({ state: 'rules_missing', missingGroups: ['x', 'y'] }));

    const { notifications } = renderPage({ get, repair, getRuleHealth });

    await settle();
    await exhaustRetries();
    expect(screen.getByTestId('slosDetailRestore')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosDetailRestore'));
    });
    await settle();

    expect(repair).toHaveBeenCalledWith('slo-1');
    expect(screen.queryByTestId('slosDetailRuleHealthCallout')).not.toBeInTheDocument();
    expect(notifications.toasts.addSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/Restored 2 rule groups/) })
    );
  });

  it('shows the "already present" info toast when repair returns repaired:false', async () => {
    const repair = jest.fn().mockResolvedValue({
      sloId: 'slo-1',
      repaired: false,
      health: makeHealth({ state: 'ok' }),
    } as RepairResponse);
    const getRuleHealth = jest
      .fn()
      .mockResolvedValue(makeHealth({ state: 'rules_missing', missingGroups: ['x'] }));

    const { notifications } = renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'rules_missing' })),
      repair,
      getRuleHealth,
    });

    await settle();
    await exhaustRetries();

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosDetailRestore'));
    });
    await settle();

    expect(notifications.toasts.addInfo).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/already present/i) })
    );
  });

  it('opens the confirm-delete modal when the callout Delete button is clicked', async () => {
    renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'rules_missing' })),
      getRuleHealth: jest
        .fn()
        .mockResolvedValue(makeHealth({ state: 'rules_missing', missingGroups: ['x'] })),
    });

    await settle();
    await exhaustRetries();

    fireEvent.click(screen.getByTestId('slosDetailBrokenDelete'));

    expect(screen.getByText(/Delete SLO "api-availability"\?/)).toBeInTheDocument();
  });

  it('renders a ruler-unreachable warning callout with a Retry that re-calls getRuleHealth', async () => {
    const getRuleHealth = jest
      .fn()
      .mockResolvedValue(
        makeHealth({ state: 'ruler_unreachable', rulerErrorCode: 'RULER_UNREACHABLE' })
      );
    renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'ok' })),
      getRuleHealth,
    });

    await settle();

    const callout = screen.getByTestId('slosDetailRuleHealthCallout');
    expect(callout).toHaveTextContent(/Ruler unreachable/i);
    expect(callout).toHaveTextContent(/RULER_UNREACHABLE/);
    // ruler_unreachable is not a "missing" state, so no grace window applies.
    expect(screen.queryByTestId('slosDetailRulePropagatingCallout')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('slosDetailRuleHealthRetry'));
    });
    await settle();

    expect(getRuleHealth).toHaveBeenCalledTimes(2);
  });

  it('renders no callout when liveStatus.state is ok and ruleHealth.state is ok', async () => {
    renderPage({
      get: jest.fn().mockResolvedValue(makeDoc({ liveStatusState: 'ok' })),
      getRuleHealth: jest.fn().mockResolvedValue(makeHealth({ state: 'ok' })),
    });

    await settle();
    expect(screen.getByTestId('slosDetailHeader')).toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailRuleHealthCallout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slosDetailRulePropagatingCallout')).not.toBeInTheDocument();
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
