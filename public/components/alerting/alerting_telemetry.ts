/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alerting Business Metrics — telemetry event helpers.
 *
 * Uses the OSD core TelemetryService (Neo browser telemetry) to emit
 * custom events for the Unified Alerting feature. Events are batched
 * and forwarded to the Neo telemetry pipeline automatically.
 *
 * Usage:
 *   import { alertingTelemetry } from './alerting_telemetry';
 *   alertingTelemetry.ruleCreated({ ruleType: 'promql', dsType: 'prometheus', dsId: 'ds-123' });
 */

import { coreRefs } from '../../framework/core_refs';
import type { PluginTelemetryRecorder } from '../../../../../src/core/public';

const PLUGIN_ID = 'dashboards-observability';

/** Lazily get the telemetry recorder — safe to call before core is ready. */
function getRecorder(): PluginTelemetryRecorder | undefined {
  try {
    const telemetry = (coreRefs.core as any)?.telemetry;
    if (!telemetry || !telemetry.isEnabled()) return undefined;
    return telemetry.getPluginRecorder(PLUGIN_ID);
  } catch {
    return undefined;
  }
}

// =========================================================================
// P0 Events
// =========================================================================

/**
 * Emit when a rule is successfully created (POST returns 200).
 */
export function ruleCreated(data: {
  ruleType: 'ppl' | 'promql';
  dsType: 'opensearch' | 'prometheus' | 'mustang' | 'serverless';
  dsId: string;
}): void {
  getRecorder()?.recordEvent({
    name: 'alerting.rule.created',
    data,
  });
}

/**
 * Emit when an alert is acknowledged (POST acknowledge returns 200).
 */
export function alertAcknowledged(data: {
  alertCount: number;
  dsType: 'opensearch' | 'prometheus';
}): void {
  getRecorder()?.recordEvent({
    name: 'alerting.alert.acknowledged',
    data,
  });
}

/**
 * Emit when an SLO is successfully created (POST returns 200).
 */
export function sloCreated(data: {
  template?: string;
  dsId: string;
}): void {
  getRecorder()?.recordEvent({
    name: 'alerting.slo.created',
    data,
  });
}

/**
 * Emit when the Create Monitor/Rule wizard is opened.
 */
export function wizardStarted(data: {
  entryPoint: 'button' | 'metricsPage' | 'sloPage' | 'rulesTab';
}): void {
  getRecorder()?.recordEvent({
    name: 'alerting.wizard.started',
    data,
  });
}

/**
 * Emit when the Create Monitor/Rule wizard submission succeeds.
 */
export function wizardCompleted(data: {
  ruleType: 'ppl' | 'promql';
  durationMs: number;
}): void {
  getRecorder()?.recordEvent({
    name: 'alerting.wizard.completed',
    data,
  });
}

// =========================================================================
// P1 Events (stubs ready for future sprints)
// =========================================================================

export function ruleDeleted(data: { ruleType: string; dsType: string }): void {
  getRecorder()?.recordEvent({ name: 'alerting.rule.deleted', data });
}

export function ruleEdited(data: { ruleType: string; dsType: string; fieldsChanged?: string[] }): void {
  getRecorder()?.recordEvent({ name: 'alerting.rule.edited', data });
}

export function sloToggled(data: { action: 'enable' | 'disable' }): void {
  getRecorder()?.recordEvent({ name: 'alerting.slo.toggled', data });
}

export function silenceCreated(data: { duration: string; matcherCount: number }): void {
  getRecorder()?.recordEvent({ name: 'alerting.silence.created', data });
}

export function wizardAbandoned(data: { step: number; durationMs: number }): void {
  getRecorder()?.recordEvent({ name: 'alerting.wizard.abandoned', data });
}

export function detailOpened(data: { detailType: 'alert' | 'rule' | 'anomaly'; dsType: string }): void {
  getRecorder()?.recordEvent({ name: 'alerting.detail.opened', data });
}

export function deepLinkFromMcp(data: { sourceWidget: string }): void {
  getRecorder()?.recordEvent({ name: 'alerting.deeplink.from_mcp', data });
}

// =========================================================================
// Convenience namespace export
// =========================================================================

export const alertingTelemetry = {
  ruleCreated,
  alertAcknowledged,
  sloCreated,
  wizardStarted,
  wizardCompleted,
  ruleDeleted,
  ruleEdited,
  sloToggled,
  silenceCreated,
  wizardAbandoned,
  detailOpened,
  deepLinkFromMcp,
};
