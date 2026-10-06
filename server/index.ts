/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema, TypeOf } from '@osd/config-schema';
import { PluginConfigDescriptor, PluginInitializerContext } from '../../../src/core/server';
import { ObservabilityPlugin } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new ObservabilityPlugin(initializerContext);
}

export { ObservabilityPluginSetup, ObservabilityPluginStart } from './types';

const observabilityConfig = {
  schema: schema.object({
    query_assist: schema.object({
      enabled: schema.boolean({ defaultValue: true }),
    }),
    summarize: schema.object({
      enabled: schema.boolean({ defaultValue: false }),
    }),
    alertManager: schema.object({
      enabled: schema.boolean({ defaultValue: false }),
    }),
    cloudwatch: schema.object({
      // Virtual CloudWatch alarms datasource for the unified Alerts view.
      //
      // EXPERIMENTAL — ships dark. Operators opt in via
      // `observability.cloudwatch.enabled: true` in `opensearch_dashboards.yml`
      // (mirrors the `alertManager.enabled` / `slo.enabled` pattern). When
      // enabled it is a zero-setup virtual datasource that binds to whatever
      // AWS account the server's ambient credentials resolve to (AWS SDK
      // default provider chain). With no credentials present it simply
      // surfaces a per-datasource warning — no data leaks and nothing to
      // configure. Region falls back to `defaultRegion` when the process has
      // no AWS_REGION/AWS_DEFAULT_REGION.
      enabled: schema.boolean({ defaultValue: false }),
      defaultRegion: schema.string({ defaultValue: 'us-east-1' }),
    }),
    errors: schema.object({
      // When true, verbatim upstream error detail (classified as `sensitive`)
      // is included in API error responses. Defaults off so open-source /
      // multi-tenant deployments never leak raw upstream text to the browser;
      // operators and downstream forks opt in per environment. The full detail
      // is always logged server-side with a correlation id regardless.
      exposeSensitiveErrorDetail: schema.boolean({ defaultValue: false }),
    }),
    slo: schema.object({
      // Top-level SLO feature gate. Ships dark — operators opt in via
      // `observability.slo.enabled: true` in `opensearch_dashboards.yml`.
      // Mirrors the `alertManager.enabled` pattern.
      enabled: schema.boolean({ defaultValue: false }),
      ruleDedup: schema.object({
        enabled: schema.boolean({ defaultValue: true }),
      }),
      reconciler: schema.object({
        // Grace-GC pass for shared recording rules. When the cross-workspace
        // aggregate refcount for a (datasourceId, fingerprint) tuple has
        // been zero past `graceMs`, the sweep deletes the ruler recording
        // group and drops the corresponding slo-rule-ref SOs.
        enabled: schema.boolean({ defaultValue: true }),
        // Sweep cadence. Default 5 min — slow enough that the
        // aggregate-refcount finds add negligible pressure, fast enough
        // that the worst-case "shared rule still alive after every
        // workspace dropped its claim" window is `graceMs + intervalMs`.
        intervalMs: schema.number({ min: 60_000, defaultValue: 300_000 }),
        // Grace window between aggregate-refcount→0 and ruler delete.
        // Matches the SLO detail-page copy ("queued for deletion, with a
        // 24h grace period in case you re-create the SLO"). Test
        // environments can shorten via the yml.
        graceMs: schema.number({ min: 0, defaultValue: 24 * 3600 * 1000 }),
      }),
    }),
  }),
};

export type ObservabilityConfig = TypeOf<typeof observabilityConfig.schema>;

export const config: PluginConfigDescriptor<ObservabilityConfig> = {
  schema: observabilityConfig.schema,
  exposeToBrowser: {
    query_assist: true,
    summarize: true,
    alertManager: true,
    slo: true,
    cloudwatch: true,
  },
};
