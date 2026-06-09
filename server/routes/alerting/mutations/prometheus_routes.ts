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
 * These routes proxy to the Cortex ruler API via the DirectQueryRulerClient,
 * which communicates through the OpenSearch DirectQuery plugin.
 */
import { schema } from '@osd/config-schema';
import { IRouter, RequestHandlerContext } from '../../../../../../src/core/server';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting';
import type { RulerClient } from '../../../services/slo/ruler_client';
import { toErrorBody, toHandlerResult } from '../route_utils';
import { alertingIdSchema } from '../schema_helpers';
import {
  handleCreatePrometheusRule,
  handleDeletePrometheusRule,
  PrometheusRulePayload,
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
        const result = await handleCreatePrometheusRule(
          rulerClient,
          client,
          datasource,
          payload,
          logger
        );
        return res.ok({ body: result });
      } catch (e: unknown) {
        const result = toHandlerResult(e, logger);
        return res.customError({
          statusCode: result.status,
          body: toErrorBody(result.body),
        });
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
        return res.customError({
          statusCode: result.status,
          body: toErrorBody(result.body),
        });
      }
    }
  );
}
