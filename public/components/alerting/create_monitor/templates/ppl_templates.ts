/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Starter PPL queries surfaced in the Create Monitor flyout's query toolbar.
 * Pure data — no React, no backend dependency. Rescued from the deleted
 * `create_logs_monitor` directory so the helpful templates aren't lost.
 */

export interface PplQueryTemplate {
  /** Short label shown in the picker. */
  label: string;
  /** PPL query body. */
  query: string;
}

export const PPL_QUERY_TEMPLATES: PplQueryTemplate[] = [
  {
    label: 'Events last hour',
    query:
      `source = logs-* | where @timestamp > NOW() - INTERVAL 1 HOUR\n` +
      `| stats count() as EVENTS_LAST_HOUR by span(@timestamp, 1h)`,
  },
  {
    label: 'Error count by service',
    query: `source = logs-* | where level = 'ERROR'\n| stats count() as error_count by service`,
  },
  {
    label: 'Login failures',
    query:
      `source = logs-* | where eventType = 'login' AND status = 'false'\n` +
      `| stats count() as failed_logins by span(@timestamp, 1h)`,
  },
];
