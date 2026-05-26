/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Registers the 4 surviving OpenSearch mutation routes.
 *
 *   POST   /api/alerting/opensearch/{dsId}/monitors
 *   PUT    /api/alerting/opensearch/{dsId}/monitors/{monitorId}
 *   DELETE /api/alerting/opensearch/{dsId}/monitors/{monitorId}
 *   POST   /api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge
 *
 * Read paths (list/get/alerts/unified/detail/metadata) have moved to the
 * client query services under `public/components/alerting/query_services/`.
 * This file intentionally hosts no GET routes.
 *
 * The caller supplies `getClient(ctx, dsId)` so MDS / workspace / scoped-client
 * resolution stays in the top-level registrar — mutation logic is transport-agnostic.
 */
import { schema } from '@osd/config-schema';
import { IRouter, RequestHandlerContext } from '../../../../../../src/core/server';
import type { AlertingOSClient, Logger, OSMonitor } from '../../../../common/types/alerting';
import { MonitorMutationService } from '../../../services/alerting/monitor_mutation_service';
import { toErrorBody, toHandlerResult } from '../route_utils';
import { alertingIdSchema } from '../schema_helpers';
import { monitorAcknowledgeBodySchema, monitorMutationBodySchema } from './body_schema';

// Context resolver for the scoped client. Mutations never need datasource
// metadata beyond what the caller's resolver already handles.
export type AlertingClientResolver = (
  ctx: RequestHandlerContext,
  dsId: string
) => Promise<AlertingOSClient>;

// ---------------------------------------------------------------------------
// Registrar
// ---------------------------------------------------------------------------

export function registerAlertingMutationRoutes(
  router: IRouter,
  mutationSvc: MonitorMutationService,
  getClient: AlertingClientResolver,
  logger?: Logger
): void {
  // POST /api/alerting/opensearch/{dsId}/monitors — create monitor
  router.post(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors',
      validate: {
        params: schema.object({ dsId: alertingIdSchema }),
        body: monitorMutationBodySchema,
      },
    },
    async (ctx, req, res) => {
      try {
        const client = await getClient(ctx, req.params.dsId);
        const monitor = (req.body as unknown) as Omit<OSMonitor, 'id'>;
        const created = await mutationSvc.createMonitor(client, monitor);
        logger?.info(
          `alerting: createMonitor success — dsId=${req.params.dsId} monitorId=${created.id}`
        );
        return res.ok({ body: created });
      } catch (e: unknown) {
        const result = toHandlerResult(e, logger);
        return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
      }
    }
  );

  // PUT /api/alerting/opensearch/{dsId}/monitors/{monitorId} — update monitor
  router.put(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: {
        params: schema.object({ dsId: alertingIdSchema, monitorId: alertingIdSchema }),
        body: monitorMutationBodySchema,
      },
    },
    async (ctx, req, res) => {
      try {
        const client = await getClient(ctx, req.params.dsId);
        const input = (req.body as unknown) as Partial<OSMonitor>;
        const updated = await mutationSvc.updateMonitor(client, req.params.monitorId, input);
        if (!updated) return res.notFound({ body: { message: 'Monitor not found' } });
        logger?.info(
          `alerting: updateMonitor success — dsId=${req.params.dsId} monitorId=${req.params.monitorId}`
        );
        return res.ok({ body: updated });
      } catch (e: unknown) {
        const result = toHandlerResult(e, logger);
        if (result.status === 409) return res.conflict({ body: toErrorBody(result.body) });
        return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
      }
    }
  );

  // DELETE /api/alerting/opensearch/{dsId}/monitors/{monitorId} — delete monitor
  router.delete(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: { params: schema.object({ dsId: alertingIdSchema, monitorId: alertingIdSchema }) },
    },
    async (ctx, req, res) => {
      try {
        const client = await getClient(ctx, req.params.dsId);
        const deleted = await mutationSvc.deleteMonitor(client, req.params.monitorId);
        if (!deleted) return res.notFound({ body: { message: 'Monitor not found' } });
        logger?.info(
          `alerting: deleteMonitor success — dsId=${req.params.dsId} monitorId=${req.params.monitorId}`
        );
        return res.ok({ body: { success: true } });
      } catch (e: unknown) {
        const result = toHandlerResult(e, logger);
        return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
      }
    }
  );

  // POST /api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge — ack alerts
  router.post(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge',
      validate: {
        params: schema.object({ dsId: alertingIdSchema, monitorId: alertingIdSchema }),
        body: monitorAcknowledgeBodySchema,
      },
    },
    async (ctx, req, res) => {
      try {
        const client = await getClient(ctx, req.params.dsId);
        const acked = await mutationSvc.acknowledgeAlerts(
          client,
          req.params.monitorId,
          req.body.alerts
        );
        logger?.info(
          `alerting: acknowledgeAlerts success — dsId=${req.params.dsId} monitorId=${req.params.monitorId} alertCount=${req.body.alerts.length}`
        );
        return res.ok({ body: { result: acked } });
      } catch (e: unknown) {
        const result = toHandlerResult(e, logger);
        return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
      }
    }
  );
}
