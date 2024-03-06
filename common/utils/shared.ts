/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export function get<T = unknown>(obj: Record<string, any>, path: string, defaultValue?: T): T {
  return path.split('.').reduce((acc: any, part: string) => acc && acc[part], obj) || defaultValue;
}

export function addBackticksIfNeeded(input: string): string {
  // Check if the string already has backticks
  if (input.startsWith('`') && input.endsWith('`')) {
    return input; // Return the string as it is
  } else {
    // Add backticks to the string
    return '`' + input + '`';
  }
}
