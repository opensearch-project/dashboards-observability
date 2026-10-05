/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validatePromQL as coreValidatePromQL } from '../../../common/services/alerting/promql_validator';

export interface ValidationError {
  message: string;
  severity: 'error' | 'warning' | 'info';
  position?: number;
}

/**
 * Flatten the core PromQL validator's errors + warnings into a single list for
 * the create/edit monitor form.
 */
export function validatePromQL(query: string): ValidationError[] {
  const result = coreValidatePromQL(query);
  const errors: ValidationError[] = [];
  for (const e of result.errors) {
    errors.push({ message: e.message, severity: e.severity, position: e.position });
  }
  for (const w of result.warnings) {
    errors.push({ message: w.message, severity: w.severity, position: w.position });
  }
  return errors;
}
