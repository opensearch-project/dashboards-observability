/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';

const mockNavigateToApp = jest.fn();
jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: {
    application: {
      navigateToApp: (...args: unknown[]) => mockNavigateToApp(...args),
    },
  },
}));

import type { SloDocument, SloLiveStatus } from '../../../../../../common/slo/slo_types';
import type { RuleHealthResponse } from '../slo_api_client';
import { SloAlertsPanel } from '../slo_alerts_panel';

type FullDoc = SloDocument & { liveStatus: SloLiveStatus };

function makeDoc(
  overrides: {
    specOverrides?: Partial<SloDocument['spec']>;
    provisioningOverrides?: Partial<SloDocument['status']['provisioning']>;
    liveStatusOverrides?: Partial<SloLiveStatus>;
  } = {}
): FullDoc {
  const spec: SloDocument['spec'] = {
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
      dimensions: [],
    },
    objectives: [{ name: 'obj-1', target: 0.99 }],
    budgetWarningThresholds: [],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: [] },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: false },
      noData: { enabled: false, forDuration: '15m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
    ...overrides.specOverrides,
  };

  return {
    id: 'slo-1',
    spec,
    status: {
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'me',
      updatedAt: '2026-01-01T00:00:00Z',
      updatedBy: 'me',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: 'slo:api-availability',
        rulerNamespace: 'slo-api-availability',
        ...overrides.provisioningOverrides,
      } as SloDocument['status']['provisioning'],
    },
    liveStatus: {
      sloId: 'slo-1',
      objectives: [],
      state: 'ok',
      firingCount: 0,
      ruleCount: 4,
      computedAt: '2026-01-01T00:00:00Z',
      ...overrides.liveStatusOverrides,
    },
  };
}

function makeRuleHealth(overrides: Partial<RuleHealthResponse> = {}): RuleHealthResponse {
  return {
    sloId: 'slo-1',
    state: 'ok',
    expectedGroups: ['slo:api-availability'],
    presentGroups: ['slo:api-availability'],
    missingGroups: [],
    computedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('SloAlertsPanel', () => {
  beforeEach(() => {
    mockNavigateToApp.mockClear();
  });

  it('renders healthy state with rule count / group count subtitle', () => {
    render(<SloAlertsPanel doc={makeDoc()} ruleHealth={makeRuleHealth()} />);
    expect(screen.getByTestId('slosDetailAlertsPanel')).toBeInTheDocument();
    expect(screen.getByTestId('slosDetailAlertsPanelSubtitle')).toHaveTextContent(
      '4 rules across 1 group'
    );
    // No health badge for a healthy SLO.
    expect(screen.queryByTestId('slosDetailAlertsPanelHealthBadge')).not.toBeInTheDocument();
  });

  it('renders a rule-groups-missing badge when ruleHealth reports partial or missing', () => {
    render(
      <SloAlertsPanel
        doc={makeDoc()}
        ruleHealth={makeRuleHealth({
          state: 'rules_missing',
          presentGroups: [],
          missingGroups: ['slo:api-availability'],
        })}
      />
    );
    expect(screen.getByTestId('slosDetailAlertsPanelHealthBadge')).toBeInTheDocument();
  });

  it('hides deep-link affordances in shadow mode and shows the suppressed-alerts note', () => {
    render(
      <SloAlertsPanel
        doc={makeDoc({ specOverrides: { mode: 'shadow' } })}
        ruleHealth={makeRuleHealth()}
      />
    );
    expect(screen.getByTestId('slosDetailAlertsPanelSubtitle')).toHaveTextContent(/shadow mode/i);
    expect(screen.queryByTestId('slosDetailAlertsPanelViewAll')).not.toBeInTheDocument();
  });

  it('navigates to the Alert Manager rules tab with q=slo_id:<id> when View all is clicked', () => {
    // The alarms page parses `?q=…` from the hash and seeds MonitorsTable's
    // search box (alarms_page.tsx :: parseAlarmsHashRoute). MonitorsTable's
    // matchesSearch supports `label:value` syntax, so `slo_id:slo-1`
    // narrows the table to exactly this SLO's alert rules.
    render(<SloAlertsPanel doc={makeDoc()} ruleHealth={makeRuleHealth()} />);
    fireEvent.click(screen.getByTestId('slosDetailAlertsPanelViewAll'));
    expect(mockNavigateToApp).toHaveBeenCalledWith('observability-alerting', {
      path: `#/rules?q=${encodeURIComponent('slo_id:slo-1')}`,
    });
  });
});
