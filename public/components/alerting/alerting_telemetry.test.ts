/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { alertingTelemetry } from './alerting_telemetry';
import { coreRefs } from '../../framework/core_refs';

describe('alertingTelemetry', () => {
  const mockRecordEvent = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (coreRefs as any).core = {
      telemetry: {
        isEnabled: () => true,
        getPluginRecorder: () => ({
          recordEvent: mockRecordEvent,
          recordMetric: jest.fn(),
          recordError: jest.fn(),
        }),
      },
    };
  });

  afterEach(() => {
    (coreRefs as any).core = undefined;
  });

  it('emits alerting.rule.created event', () => {
    alertingTelemetry.ruleCreated({ ruleType: 'promql', dsType: 'prometheus', dsId: 'ds-1' });
    expect(mockRecordEvent).toHaveBeenCalledWith({
      name: 'alerting.rule.created',
      data: { ruleType: 'promql', dsType: 'prometheus', dsId: 'ds-1' },
    });
  });

  it('emits alerting.alert.acknowledged event', () => {
    alertingTelemetry.alertAcknowledged({ alertCount: 3, dsType: 'opensearch' });
    expect(mockRecordEvent).toHaveBeenCalledWith({
      name: 'alerting.alert.acknowledged',
      data: { alertCount: 3, dsType: 'opensearch' },
    });
  });

  it('emits alerting.slo.created event', () => {
    alertingTelemetry.sloCreated({ template: 'apm-availability', dsId: 'ds-2' });
    expect(mockRecordEvent).toHaveBeenCalledWith({
      name: 'alerting.slo.created',
      data: { template: 'apm-availability', dsId: 'ds-2' },
    });
  });

  it('emits alerting.wizard.started event', () => {
    alertingTelemetry.wizardStarted({ entryPoint: 'button' });
    expect(mockRecordEvent).toHaveBeenCalledWith({
      name: 'alerting.wizard.started',
      data: { entryPoint: 'button' },
    });
  });

  it('emits alerting.wizard.completed event', () => {
    alertingTelemetry.wizardCompleted({ ruleType: 'ppl', durationMs: 5000 });
    expect(mockRecordEvent).toHaveBeenCalledWith({
      name: 'alerting.wizard.completed',
      data: { ruleType: 'ppl', durationMs: 5000 },
    });
  });

  it('is a no-op when telemetry is disabled', () => {
    (coreRefs as any).core = {
      telemetry: { isEnabled: () => false, getPluginRecorder: jest.fn() },
    };
    alertingTelemetry.ruleCreated({ ruleType: 'ppl', dsType: 'opensearch', dsId: 'ds-1' });
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it('is a no-op when core is not initialized', () => {
    (coreRefs as any).core = undefined;
    alertingTelemetry.ruleCreated({ ruleType: 'ppl', dsType: 'opensearch', dsId: 'ds-1' });
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it('does not throw when telemetry throws internally', () => {
    (coreRefs as any).core = {
      telemetry: {
        isEnabled: () => { throw new Error('boom'); },
      },
    };
    expect(() => {
      alertingTelemetry.ruleCreated({ ruleType: 'ppl', dsType: 'opensearch', dsId: 'ds-1' });
    }).not.toThrow();
  });
});
