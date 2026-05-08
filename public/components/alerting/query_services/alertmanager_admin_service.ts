/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AlertmanagerAdminService — frontend transport for Alertmanager admin
 * endpoints (status/receivers/silences). Q1 verified these paths are NOT
 * surfaced by the upstream `query_enhancements` resource manager, so this
 * service continues to hit the surviving thin `/api/alerting/alertmanager/*`
 * route. When upstream adds the missing resource types, this service gets
 * swapped in the same way as AlertingPromResourcesService.
 */
import { coreRefs } from '../../../framework/core_refs';
import type { AlertmanagerConfigResponse } from '../../../../common/types/alerting';

export class AlertmanagerAdminService {
  private requireHttp() {
    const http = coreRefs.http;
    if (!http) throw new Error('HTTP client not available');
    return http;
  }

  /** Fetch Alertmanager status + parsed config YAML. */
  async getConfig(dsId?: string): Promise<AlertmanagerConfigResponse> {
    return (await this.requireHttp().get('/api/alerting/alertmanager/config', {
      query: dsId ? { dsId } : undefined,
    })) as AlertmanagerConfigResponse;
  }
}
