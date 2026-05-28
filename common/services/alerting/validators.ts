/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core validation utilities for monitor forms and duration strings.
 */
import { UnifiedAlertSeverity } from '../../types/alerting';

// ============================================================================
// Duration Parsing
// ============================================================================

const DURATION_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export function parseDuration(input: string): { valid: boolean; seconds: number; error?: string } {
  if (!input || typeof input !== 'string')
    return { valid: false, seconds: 0, error: 'Duration is required' };
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d+)\s*([smhd])$/);
  if (!match)
    return {
      valid: false,
      seconds: 0,
      error: `Invalid duration format "${trimmed}". Expected <number><s|m|h|d>`,
    };
  const value = parseInt(match[1], 10);
  if (value <= 0) return { valid: false, seconds: 0, error: 'Duration must be positive' };
  return { valid: true, seconds: value * DURATION_UNITS[match[2]] };
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

// ============================================================================
// Monitor Form Validation
// ============================================================================

export interface ThresholdCondition {
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  value: number;
  unit: string;
  forDuration: string;
}

export interface LabelEntry {
  key: string;
  value: string;
  isDynamic?: boolean;
}
export interface AnnotationEntry {
  key: string;
  value: string;
}

export interface MonitorFormState {
  name: string;
  query: string;
  threshold: ThresholdCondition;
  evaluationInterval: string;
  pendingPeriod: string;
  firingPeriod: string;
  labels: LabelEntry[];
  annotations: AnnotationEntry[];
  severity: UnifiedAlertSeverity;
  enabled: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;

export function validateMonitorForm(form: MonitorFormState): ValidationResult {
  const errors: Record<string, string> = {};

  if (!form.name || !form.name.trim()) errors.name = 'Name is required';
  else if (form.name.length > 256) errors.name = 'Name must be 256 characters or fewer';
  else if (CONTROL_CHAR_RE.test(form.name))
    errors.name = 'Name must not contain control characters';

  if (!form.query || !form.query.trim()) errors.query = 'Query is required';

  if (form.threshold) {
    if (!isFinite(form.threshold.value))
      errors['threshold.value'] = 'Threshold value must be a finite number';
    const forDur = parseDuration(form.threshold.forDuration);
    if (!forDur.valid) errors['threshold.forDuration'] = forDur.error || 'Invalid duration';
  }

  for (const field of ['evaluationInterval', 'pendingPeriod', 'firingPeriod'] as const) {
    if (form[field]) {
      const dur = parseDuration(form[field]);
      if (!dur.valid) errors[field] = dur.error || 'Invalid duration';
    }
  }

  // Validate labels: safe key pattern, no duplicates, max counts
  const LABEL_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  const MAX_LABELS = 50;
  const MAX_LABEL_VALUE_LENGTH = 1024;

  if (form.labels.length > MAX_LABELS) {
    errors.labels = `Too many labels (max ${MAX_LABELS})`;
  }

  const labelKeys = new Set<string>();
  for (let i = 0; i < Math.min(form.labels.length, MAX_LABELS); i++) {
    const l = form.labels[i];
    if (l.key || l.value) {
      if (!l.key.trim()) {
        errors[`labels[${i}].key`] = 'Label key is required';
      } else if (!LABEL_KEY_PATTERN.test(l.key)) {
        errors[`labels[${i}].key`] =
          'Label key must match [a-zA-Z_][a-zA-Z0-9_]* (alphanumeric and underscores)';
      } else if (labelKeys.has(l.key)) {
        errors[`labels[${i}].key`] = `Duplicate label key "${l.key}"`;
      } else {
        labelKeys.add(l.key);
      }
      if (l.value && l.value.length > MAX_LABEL_VALUE_LENGTH) {
        errors[`labels[${i}].value`] = `Label value too long (max ${MAX_LABEL_VALUE_LENGTH} chars)`;
      }
    }
  }

  // Validate annotations: safe key pattern, no duplicates, max counts
  if (form.annotations.length > MAX_LABELS) {
    errors.annotations = `Too many annotations (max ${MAX_LABELS})`;
  }

  const annotationKeys = new Set<string>();
  for (let i = 0; i < Math.min(form.annotations.length, MAX_LABELS); i++) {
    const a = form.annotations[i];
    if (a.key || a.value) {
      if (!a.key.trim()) {
        errors[`annotations[${i}].key`] = 'Annotation key is required';
      } else if (!LABEL_KEY_PATTERN.test(a.key)) {
        errors[`annotations[${i}].key`] =
          'Annotation key must match [a-zA-Z_][a-zA-Z0-9_]* (alphanumeric and underscores)';
      } else if (annotationKeys.has(a.key)) {
        errors[`annotations[${i}].key`] = `Duplicate annotation key "${a.key}"`;
      } else {
        annotationKeys.add(a.key);
      }
      if (a.value && a.value.length > MAX_LABEL_VALUE_LENGTH) {
        errors[
          `annotations[${i}].value`
        ] = `Annotation value too long (max ${MAX_LABEL_VALUE_LENGTH} chars)`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ============================================================================
// PPL Monitor Form Validation
// ============================================================================

// Mirror the alerting plugin's cluster-setting defaults
// (`plugins.alerting.ppl_monitor_max_query_length`,
// `plugins.alerting.ppl_query_results_max_datarows`,
// `plugins.alerting.notification_subject_source_max_length`,
// `plugins.alerting.notification_message_source_max_length`).
// The server is authoritative; these caps just prevent obvious round-trips.
// PPL monitors enforce a name-length cap in common-utils (Monitor class,
// only for monitor_type = ppl_monitor). The custom alerting backend is
// raising this from 30 → 100 in an upcoming PR; set to 100 pre-emptively
// so the UI doesn't block valid names once the backend ships.
export const PPL_MONITOR_NAME_MAX = 100;
export const PPL_QUERY_MAX_LENGTH = 2000;
export const PPL_NUM_RESULTS_MIN = 1;
export const PPL_NUM_RESULTS_MAX = 10000;
export const PPL_NOTIFICATION_SUBJECT_MAX = 1000;
export const PPL_NOTIFICATION_MESSAGE_MAX = 5000;

const PPL_NUM_RESULTS_OPERATORS = new Set(['>', '>=', '<', '<=', '==', '!=']);
/** Backend rejects custom conditions that don't start with `where`. */
export const PPL_CUSTOM_CONDITION_REGEX = /^\s*where\s+.+/i;

interface PplActionShape {
  destinationId: string;
  subject: string;
  message: string;
}

interface PplTriggerShape {
  name: string;
  type: 'number_of_results' | 'custom';
  numResultsCondition: string;
  numResultsValue: number;
  customCondition: string;
  actions: PplActionShape[];
}

export interface PplFormShape {
  name: string;
  query: string;
  pplTriggers: PplTriggerShape[];
}

export function validatePplForm(form: PplFormShape): ValidationResult {
  const errors: Record<string, string> = {};

  if (!form.name || !form.name.trim()) {
    errors.name = 'Name is required';
  } else if (form.name.length > PPL_MONITOR_NAME_MAX) {
    errors.name = `Name must be ${PPL_MONITOR_NAME_MAX} characters or fewer`;
  } else if (CONTROL_CHAR_RE.test(form.name)) {
    errors.name = 'Name must not contain control characters';
  }

  if (!form.query || !form.query.trim()) {
    errors.query = 'PPL query is required';
  } else if (form.query.length > PPL_QUERY_MAX_LENGTH) {
    errors.query = `PPL query must be ≤ ${PPL_QUERY_MAX_LENGTH} characters`;
  }

  if (form.pplTriggers.length === 0) {
    errors.pplTriggers = 'At least one trigger is required';
  }

  form.pplTriggers.forEach((t, i) => {
    const prefix = `pplTriggers[${i}]`;
    if (!t.name || !t.name.trim()) {
      errors[`${prefix}.name`] = 'Trigger name is required';
    }

    if (t.type === 'number_of_results') {
      if (!PPL_NUM_RESULTS_OPERATORS.has(t.numResultsCondition)) {
        errors[`${prefix}.numResultsCondition`] = 'Pick a valid comparison operator';
      }
      if (
        !Number.isFinite(t.numResultsValue) ||
        !Number.isInteger(t.numResultsValue) ||
        t.numResultsValue < PPL_NUM_RESULTS_MIN ||
        t.numResultsValue > PPL_NUM_RESULTS_MAX
      ) {
        errors[
          `${prefix}.numResultsValue`
        ] = `Threshold must be an integer between ${PPL_NUM_RESULTS_MIN} and ${PPL_NUM_RESULTS_MAX}`;
      }
    } else if (t.type === 'custom') {
      if (!t.customCondition || !PPL_CUSTOM_CONDITION_REGEX.test(t.customCondition)) {
        errors[`${prefix}.customCondition`] = 'Custom condition must start with `where`';
      }
    }

    t.actions.forEach((a, j) => {
      const aPrefix = `${prefix}.actions[${j}]`;
      if (!a.destinationId) {
        errors[`${aPrefix}.destinationId`] = 'Destination is required';
      }
      if (a.subject && a.subject.length > PPL_NOTIFICATION_SUBJECT_MAX) {
        errors[
          `${aPrefix}.subject`
        ] = `Subject must be ≤ ${PPL_NOTIFICATION_SUBJECT_MAX} characters`;
      }
      if (!a.message || a.message.length === 0) {
        errors[`${aPrefix}.message`] = 'Message is required';
      } else if (a.message.length > PPL_NOTIFICATION_MESSAGE_MAX) {
        errors[
          `${aPrefix}.message`
        ] = `Message must be ≤ ${PPL_NOTIFICATION_MESSAGE_MAX} characters`;
      }
    });
  });

  return { valid: Object.keys(errors).length === 0, errors };
}
