/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor serialization for JSON export/import.
 */
import { UnifiedRuleSummary, UnifiedRule, NotificationRouting } from '../../types/alerting';
import { parseDuration } from './validators';

/** Safely extract a string-to-string map, enforcing max count and string values. */
function sanitizeStringMap(input: unknown, maxKeys: number): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const result: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= maxKeys) break;
    if (typeof key === 'string' && typeof value === 'string') {
      result[key] = value.substring(0, 10_000);
      count++;
    }
  }
  return result;
}

export interface MonitorConfig {
  version: '1.0';
  name: string;
  query: string;
  threshold: { operator: string; value: number; unit?: string; forDuration: string };
  evaluation: { interval: string; pendingPeriod: string; firingPeriod?: string };
  labels: Record<string, string>;
  annotations: Record<string, string>;
  severity: string;
  routing?: Array<{ channel: string; destination: string; severity?: string[]; throttle?: string }>;
}

/** Accepts both summary and full rule types for serialization. */
export function serializeMonitor(rule: UnifiedRuleSummary): MonitorConfig {
  // Detail fields are optional — only present when a full UnifiedRule is passed
  const fullRule = rule as Partial<UnifiedRule>;
  const routing: NotificationRouting[] = fullRule.notificationRouting ?? [];

  return {
    version: '1.0',
    name: rule.name,
    query: rule.query,
    threshold: {
      operator: rule.threshold?.operator || '>',
      value: rule.threshold?.value ?? 0,
      unit: rule.threshold?.unit,
      forDuration: rule.pendingPeriod || '5m',
    },
    evaluation: {
      interval: rule.evaluationInterval || '1m',
      pendingPeriod: rule.pendingPeriod || '5m',
      firingPeriod: fullRule.firingPeriod,
    },
    labels: { ...rule.labels },
    annotations: { ...rule.annotations },
    severity: rule.severity,
    routing:
      routing.length > 0
        ? routing.map((r) => ({
            channel: r.channel,
            destination: r.destination,
            severity: r.severity,
            throttle: r.throttle,
          }))
        : undefined,
  };
}

export function serializeMonitors(rules: UnifiedRuleSummary[]): MonitorConfig[] {
  return rules.map(serializeMonitor);
}

const MAX_STRING_LENGTH = 10_000;
const MAX_LABEL_COUNT = 100;

export function deserializeMonitor(
  json: unknown
): {
  config: MonitorConfig | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (!json || typeof json !== 'object') {
    return { config: null, errors: ['Input must be a JSON object'] };
  }

  // Guard against excessively large payloads
  const rawSize = JSON.stringify(json).length;
  if (rawSize > 1_000_000) {
    return { config: null, errors: ['Input too large (max 1MB)'] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deserialized JSON has unknown shape
  const obj = json as Record<string, any>;

  if (!obj.name || typeof obj.name !== 'string') errors.push('name: required string field');
  else if (obj.name.length > MAX_STRING_LENGTH)
    errors.push(`name: too long (max ${MAX_STRING_LENGTH} chars)`);

  if (!obj.query || typeof obj.query !== 'string') errors.push('query: required string field');
  else if (obj.query.length > MAX_STRING_LENGTH)
    errors.push(`query: too long (max ${MAX_STRING_LENGTH} chars)`);

  if (!obj.threshold || typeof obj.threshold !== 'object') {
    errors.push('threshold: required object with operator, value, forDuration');
  } else {
    if (typeof obj.threshold.operator !== 'string')
      errors.push('threshold.operator: required string');
    if (typeof obj.threshold.value !== 'number' || !isFinite(obj.threshold.value))
      errors.push('threshold.value: required finite number');
    if (obj.threshold.forDuration) {
      const dur = parseDuration(obj.threshold.forDuration);
      if (!dur.valid) errors.push(`threshold.forDuration: ${dur.error}`);
    } else {
      errors.push('threshold.forDuration: required duration string');
    }
  }

  if (!obj.evaluation || typeof obj.evaluation !== 'object') {
    errors.push('evaluation: required object with interval, pendingPeriod');
  } else {
    for (const field of ['interval', 'pendingPeriod']) {
      if (obj.evaluation[field]) {
        const dur = parseDuration(obj.evaluation[field]);
        if (!dur.valid) errors.push(`evaluation.${field}: ${dur.error}`);
      } else {
        errors.push(`evaluation.${field}: required duration string`);
      }
    }
    if (obj.evaluation.firingPeriod) {
      const dur = parseDuration(obj.evaluation.firingPeriod);
      if (!dur.valid) errors.push(`evaluation.firingPeriod: ${dur.error}`);
    }
  }

  if (errors.length > 0) return { config: null, errors };

  const config: MonitorConfig = {
    version: '1.0',
    name: obj.name,
    query: obj.query,
    threshold: {
      operator: obj.threshold.operator,
      value: obj.threshold.value,
      unit: obj.threshold.unit,
      forDuration: obj.threshold.forDuration,
    },
    evaluation: {
      interval: obj.evaluation.interval,
      pendingPeriod: obj.evaluation.pendingPeriod,
      firingPeriod: obj.evaluation.firingPeriod,
    },
    labels: sanitizeStringMap(obj.labels, MAX_LABEL_COUNT),
    annotations: sanitizeStringMap(obj.annotations, MAX_LABEL_COUNT),
    severity: obj.severity || 'medium',
    routing: Array.isArray(obj.routing) ? obj.routing.slice(0, 20) : undefined,
  };

  return { config, errors: [] };
}
