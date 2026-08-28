/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getEditLifecycleBlocker, humanizeAdUpdateError } from '../create_ad_rule_flyout';
import { isAdResourceRunning } from '../shared_constants';
import type {
  ADForecaster,
  MonitorStatus,
  UnifiedRuleSummary,
} from '../../../../common/types/alerting';

/**
 * BUG-AD1: the forecaster edit gate (getEditLifecycleBlocker) decided "is it running"
 * with a hand-maintained state list that drifted from isAdResourceRunning — the shared
 * predicate the detail flyout uses. States such as the generic "Initializing" slipped
 * through the gate, so the backend rejected the update with a raw
 * "Job is running: forecast-<id>" string. These tests assert the two predicates now
 * agree for every forecaster status and that the raw string never reaches the user.
 */

// Every status a forecaster row can carry (MonitorStatus domain, unified_types.ts).
const ALL_STATUSES: MonitorStatus[] = [
  'active',
  'pending',
  'muted',
  'disabled',
  'Running',
  'Stopped',
  'Initializing',
  'Finished',
  'Feature required',
  'Initialization failure',
  'Unexpected failure',
  'Failed',
  'Inactive stopped',
  'Inactive not started',
  'Awaiting data to init',
  'Awaiting data to restart',
  'Initializing test',
  'Initializing forecast',
  'Test complete',
  'Init forecast failure',
  'Forecast failure',
  'Init test failure',
];

const summaryForStatus = (status: MonitorStatus, enabled = false): UnifiedRuleSummary =>
  ({
    monitorType: 'forecaster',
    definitionType: 'forecaster',
    status,
    enabled,
  }) as unknown as UnifiedRuleSummary;

// A real forecaster `curState` is the backend UPPER_SNAKE enum (`RUNNING`,
// `INITIALIZING_FORECAST`), NOT the prose `MonitorStatus`. Feed that enum so the
// gate's raw→prose normalization + the shared `isAdResourceRunning` predicate are
// what's actually exercised — the prose form is a domain the gate never receives
// in production, so feeding it would prove a code path that doesn't run.
const toRawEnum = (status: MonitorStatus): string => status.toUpperCase().replace(/ /g, '_');

const rawForecasterForStatus = (status: MonitorStatus, enabled = false): ADForecaster =>
  ({
    id: 'forecast-1',
    curState: toRawEnum(status),
    enabled,
  }) as unknown as ADForecaster;

describe('forecaster edit gate vs shared running-state predicate (BUG-AD1)', () => {
  it.each(ALL_STATUSES)(
    'blocks editing whenever isAdResourceRunning reports "%s" as running',
    (status) => {
      const running = isAdResourceRunning(summaryForStatus(status));
      const blocker = getEditLifecycleBlocker('forecaster', rawForecasterForStatus(status), false);

      if (running) {
        // The backend would reject the update — the gate MUST catch it first.
        expect(blocker).not.toBeNull();
      }
    }
  );

  it('gates the generic "Initializing" state that previously slipped through', () => {
    // Regression guard for the exact state the shared predicate treats as running but
    // the old hand-maintained list omitted.
    expect(isAdResourceRunning(summaryForStatus('Initializing'))).toBe(true);
    expect(
      getEditLifecycleBlocker('forecaster', rawForecasterForStatus('Initializing'), false)
    ).not.toBeNull();
  });

  it('routes an initializing test to the dedicated "forecaster-test" blocker', () => {
    expect(
      getEditLifecycleBlocker('forecaster', rawForecasterForStatus('Initializing test'), false)
    ).toBe('forecaster-test');
  });

  it('does not block once the forecaster has been stopped for edit', () => {
    expect(
      getEditLifecycleBlocker('forecaster', rawForecasterForStatus('Running'), true)
    ).toBeNull();
  });

  it('gates an enabled forecaster even when its status is not a running state', () => {
    expect(
      getEditLifecycleBlocker('forecaster', rawForecasterForStatus('Stopped', true), false)
    ).not.toBeNull();
  });

  it('engages the shared predicate on the raw UPPER_SNAKE curState a forecaster actually carries', () => {
    // Explicit guard for the production shape: cur_state is the enum, not prose.
    // The raw→prose normalization must let isAdResourceRunning fire so these block.
    const raw = (curState: string, enabled = false): ADForecaster =>
      ({ id: 'forecast-1', curState, enabled }) as unknown as ADForecaster;
    expect(getEditLifecycleBlocker('forecaster', raw('RUNNING'), false)).not.toBeNull();
    expect(getEditLifecycleBlocker('forecaster', raw('INITIALIZING'), false)).not.toBeNull();
    expect(
      getEditLifecycleBlocker('forecaster', raw('INITIALIZING_FORECAST'), false)
    ).not.toBeNull();
    expect(
      getEditLifecycleBlocker('forecaster', raw('AWAITING_DATA_TO_INIT'), false)
    ).not.toBeNull();
    // A genuinely stopped, disabled forecaster carries no running enum → editable.
    expect(getEditLifecycleBlocker('forecaster', raw('STOPPED'), false)).toBeNull();
  });
});

describe('humanizeAdUpdateError never leaks the internal job id (BUG-AD1)', () => {
  const RAW = 'Job is running: forecast-abc123';

  it('replaces the raw "Job is running: forecast-<id>" string with guidance', () => {
    const message = humanizeAdUpdateError(RAW, 'forecaster');
    expect(message).not.toContain('Job is running');
    expect(message).not.toContain('forecast-abc123');
    expect(message).toMatch(/stop the forecaster/i);
  });

  it('produces detector-specific guidance for the same rejection', () => {
    const message = humanizeAdUpdateError('Job is running: detector-xyz', 'detector');
    expect(message).not.toContain('Job is running');
    expect(message).not.toContain('detector-xyz');
    expect(message).toMatch(/stop the detector/i);
  });

  it('passes through unrelated error messages unchanged', () => {
    const other = 'Index metrics-hosts does not exist';
    expect(humanizeAdUpdateError(other, 'forecaster')).toBe(other);
  });
});
