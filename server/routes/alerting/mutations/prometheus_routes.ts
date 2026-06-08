/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Registers Prometheus rule mutation routes:
 *
 *   POST   /api/alerting/prometheus/{dsId}/rules       — create rule
 *   DELETE /api/alerting/prometheus/{dsId}/rules/{groupName} — delete rule
 *
 * These routes call the Cortex ruler API directly via HTTP, since the
 * OpenSearch DirectQuery proxy does not support POST/DELETE to the ruler.
 * The ruler URI is resolved from the datasource's `prometheus.ruler.uri`
 * property stored in OpenSearch.
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { schema } from '@osd/config-schema';
import { IRouter, RequestHandlerContext } from '../../../../../../src/core/server';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting';
import type { RulerClient } from '../../../services/slo/ruler_client';
import { toErrorBody, toHandlerResult } from '../route_utils';
import { alertingIdSchema } from '../schema_helpers';
import {
  buildRuleGroup,
  handleDeletePrometheusRule,
  PrometheusRulePayload,
  USER_RULES_NAMESPACE,
} from './prometheus_handlers';

export type PrometheusClientResolver = (
  ctx: RequestHandlerContext,
  dsId: string
) => Promise<{ client: AlertingOSClient; datasource: Datasource }>;

const prometheusRuleBodySchema = schema.object({
  name: schema.string({ minLength: 1, maxLength: 256 }),
  query: schema.string({ minLength: 1 }),
  operator: schema.oneOf(
    [
      schema.literal('>'),
      schema.literal('>='),
      schema.literal('<'),
      schema.literal('<='),
      schema.literal('=='),
      schema.literal('!='),
    ],
    { defaultValue: '>' }
  ),
  threshold: schema.number(),
  forDuration: schema.string({ defaultValue: '5m' }),
  evaluationInterval: schema.string({ defaultValue: '1m' }),
  labels: schema.recordOf(schema.string(), schema.string(), { defaultValue: {} }),
  annotations: schema.recordOf(schema.string(), schema.string(), { defaultValue: {} }),
  enabled: schema.boolean({ defaultValue: true }),
  groupName: schema.maybe(schema.string()),
});

/**
 * Resolve the Cortex ruler base URI from the datasource properties in OpenSearch.
 * Accepts either the datasource name or directQueryName.
 */
async function resolveRulerUri(client: AlertingOSClient, datasource: Datasource): Promise<string> {
  const dsName = datasource.directQueryName || datasource.name;
  const resp = await client.transport.request({
    method: 'GET',
    path: '/_plugins/_query/_datasources',
  });
  const datasources = (resp?.body ?? resp) as Array<{
    name: string;
    properties?: Record<string, string>;
  }>;
  const ds = datasources.find((d) => d.name === dsName);
  const rulerUri = ds?.properties?.['prometheus.ruler.uri'] || ds?.properties?.['prometheus.uri'];
  if (!rulerUri) {
    throw new Error(
      `Could not resolve ruler URI for datasource "${dsName}" (id=${datasource.id})`
    );
  }
  return rulerUri;
}

/**
 * Make a direct HTTP request to the Cortex ruler API.
 */
function httpRequest(
  method: string,
  url: string,
  body?: string,
  contentType?: string
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const options = {
      method,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      headers: contentType ? { 'Content-Type': contentType } : undefined,
    };
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 500, body: data }));
    });
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Cortex ruler request timed out after 30s'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Convert a GeneratedRuleGroup to YAML for the Cortex ruler API.
 */
function ruleGroupToYaml(group: ReturnType<typeof buildRuleGroup>): string {
  // Use the pre-built yaml from buildRuleGroup
  return group.yaml;
}

export function registerPrometheusRuleRoutes(
  router: IRouter,
  rulerClient: RulerClient,
  getClientAndDs: PrometheusClientResolver,
  logger?: Logger
): void {
  // POST /api/alerting/prometheus/{dsId}/rules — create Prometheus alerting rule
  router.post(
    {
      path: '/api/alerting/prometheus/{dsId}/rules',
      validate: {
        params: schema.object({ dsId: alertingIdSchema }),
        body: prometheusRuleBodySchema,
      },
    },
    async (ctx, req, res) => {
      try {
        const { client, datasource } = await getClientAndDs(ctx, req.params.dsId);
        const payload = req.body as PrometheusRulePayload;
        const group = buildRuleGroup(payload);
        const yaml = ruleGroupToYaml(group);

        // Try direct HTTP to Cortex ruler first
        const rulerUri = await resolveRulerUri(client, datasource);
        const url = `${rulerUri}/api/v1/rules/${encodeURIComponent(USER_RULES_NAMESPACE)}`;
        logger?.info(`alerting: POST ruler directly at ${url}`);

        const resp = await httpRequest('POST', url, yaml, 'application/yaml');

        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          logger?.info(
            `alerting: createPrometheusRule success — ds=${datasource.id} group=${group.groupName}`
          );
          return res.ok({
            body: { success: true, groupName: group.groupName, namespace: USER_RULES_NAMESPACE },
          });
        }

        // If direct call fails, fall back to DirectQuery ruler client
        logger?.warn(
          `alerting: Direct ruler POST failed (${resp.statusCode}: ${resp.body}), trying DirectQuery...`
        );
        await rulerClient.upsertRuleGroup(client, datasource, USER_RULES_NAMESPACE, group);
        return res.ok({
          body: { success: true, groupName: group.groupName, namespace: USER_RULES_NAMESPACE },
        });
      } catch (e: unknown) {
        const result = toHandlerResult(e, logger);
        return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
      }
    }
  );

  // DELETE /api/alerting/prometheus/{dsId}/rules/{groupName} — delete rule group
  router.delete(
    {
      path: '/api/alerting/prometheus/{dsId}/rules/{groupName}',
      validate: {
        params: schema.object({
          dsId: alertingIdSchema,
          groupName: schema.string({ minLength: 1 }),
        }),
      },
    },
    async (ctx, req, res) => {
      try {
        const { client, datasource } = await getClientAndDs(ctx, req.params.dsId);

        // Try direct HTTP to Cortex ruler first
        const rulerUri = await resolveRulerUri(client, datasource);
        const url = `${rulerUri}/api/v1/rules/${encodeURIComponent(USER_RULES_NAMESPACE)}/${encodeURIComponent(req.params.groupName)}`;
        logger?.info(`alerting: DELETE ruler directly at ${url}`);

        const resp = await httpRequest('DELETE', url);

        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          logger?.info(
            `alerting: deletePrometheusRule success — ds=${datasource.id} group=${req.params.groupName}`
          );
          return res.ok({ body: { success: true } });
        }

        // If direct fails, fall back to DirectQuery
        logger?.warn(
          `alerting: Direct ruler DELETE failed (${resp.statusCode}: ${resp.body}), trying DirectQuery...`
        );
        const result = await handleDeletePrometheusRule(
          rulerClient,
          client,
          datasource,
          req.params.groupName,
          logger
        );
        return res.ok({ body: result });
      } catch (e: unknown) {
        const result = toHandlerResult(e, logger);
        return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
      }
    }
  );
}
