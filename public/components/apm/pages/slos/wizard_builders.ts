/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Turns the wizard's form state into an `SloCreateInput` that the server
 * accepts. Parsing (percent → decimal, seconds → number, key=value blocks)
 * lives here so the section components stay render-only.
 */

import type {
  Objective,
  PrometheusSli,
  SingleSli,
  SloCreateInput,
  SloSpec,
} from '../../../../../common/slo/slo_types';
import type { SloTemplate } from '../../../../../common/slo/slo_templates';
import type { FormState } from './wizard_state';
import type { KeyValueEntry } from './wizard_key_value_grid';

export function parseKeyValueBlock(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Flatten a KeyValueEntry[] into the flat Record<string,string> shape the
 * spec expects. Rows without a key are dropped (the user likely hasn't
 * finished filling them in); empty values are preserved so the caller can
 * express "this label key exists but has no value" if needed.
 */
export function entriesToRecord(entries: KeyValueEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of entries) {
    const trimmed = key.trim();
    if (!trimmed) continue;
    out[trimmed] = value;
  }
  return out;
}

function buildSli(state: FormState, template: SloTemplate): SingleSli {
  const prom: PrometheusSli = {
    backend: 'prometheus',
    type: template.sli.type,
    calcMethod: template.sli.calcMethod,
    metric: template.sli.metric,
    goodEventsFilter:
      template.sli.type === 'availability' && state.goodEventsFilter
        ? state.goodEventsFilter
        : undefined,
    latencyThresholdUnit:
      template.sli.type === 'latency_threshold' ? state.latencyThresholdUnit : undefined,
  };
  if (template.sli.type === 'custom') {
    // Custom SLIs carry the user's own PromQL. `metric` is omitted — the
    // generator reads `customExpr` instead.
    prom.metric = undefined;
    if (state.customPromql.mode === 'events') {
      prom.customExpr = {
        mode: 'events',
        goodQuery: state.customPromql.goodQuery,
        totalQuery: state.customPromql.totalQuery,
      };
    } else {
      prom.customExpr = {
        mode: 'raw',
        errorRatioQuery: state.customPromql.errorRatioQuery,
      };
    }
  }
  return {
    type: 'single',
    definition: prom,
    // Custom SLIs don't require a dimension — the user's PromQL already scopes
    // the series. Non-custom requires at least one; the validator enforces.
    dimensions:
      template.sli.type === 'custom'
        ? state.dimensions.filter((d) => d.name && d.value)
        : state.dimensions.filter((d) => d.name && d.value),
  };
}

function buildObjective(row: FormState['objectives'][number], template: SloTemplate): Objective {
  const targetDecimal = Number(row.target) / 100;
  const obj: Objective = {
    name: row.name,
    target: Number.isFinite(targetDecimal) ? targetDecimal : 0,
  };
  if (template.sli.type === 'latency_threshold') {
    obj.latencyThreshold = Number(row.latencyThreshold);
  }
  return obj;
}

export function buildCreateInput(state: FormState, template: SloTemplate): SloCreateInput {
  const spec: SloSpec = {
    datasourceId: state.datasourceId,
    name: state.name,
    description: state.description || undefined,
    enabled: true,
    mode: state.shadow ? 'shadow' : 'active',
    service: state.service,
    owner: {
      teams: state.ownerTeam ? [state.ownerTeam] : [],
      primaryUser: state.ownerPrimaryUser || undefined,
    },
    tier: state.tier || undefined,
    sli: buildSli(state, template),
    objectives: state.objectives.map((row) => buildObjective(row, template)),
    budgetWarningThresholds: state.budgetWarnings.map((b) => ({ ...b })),
    window: { type: 'rolling', duration: state.windowDuration },
    alerting: { strategy: 'mwmbr', burnRates: state.burnRates.map((t) => ({ ...t })) },
    alarms: {
      sliHealth: { enabled: state.alarms.sliHealth.enabled },
      attainmentBreach: { enabled: state.alarms.attainmentBreach.enabled },
      budgetWarning: { enabled: state.alarms.budgetWarning.enabled },
      noData: {
        enabled: state.alarms.noData.enabled,
        forDuration: state.alarms.noData.forDuration,
      },
      resolved: { enabled: state.alarms.resolved.enabled },
    },
    exclusionWindows: state.exclusionWindows.map((ew) => ({ ...ew, schedule: { ...ew.schedule } })),
    labels: entriesToRecord(state.labels),
    annotations: entriesToRecord(state.annotations),
  };
  return { spec };
}
