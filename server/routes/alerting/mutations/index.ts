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
import type { AlertingOSClient, OSMonitor } from '../../../../common/types/alerting';
import { MonitorMutationService } from '../../../services/alerting/monitor_mutation_service';
import { toErrorBody } from '../route_utils';
import {
  handleCreateOSMonitor,
  handleUpdateOSMonitor,
  handleDeleteOSMonitor,
  handleAcknowledgeOSAlerts,
} from './handlers';

// Context resolver for the scoped client. Mutations never need datasource
// metadata beyond what the caller's resolver already handles.
export type AlertingClientResolver = (
  ctx: RequestHandlerContext,
  dsId: string
) => Promise<AlertingOSClient>;

// ---------------------------------------------------------------------------
// Monitor body schema — structured to accept all monitor types while
// rejecting unknown top-level keys and enforcing string types on critical
// fields (script sources, index names). Copied verbatim from the pre-refactor
// registrar so the request validation contract is unchanged.
// ---------------------------------------------------------------------------

const scriptSchema = schema.object(
  { source: schema.string(), lang: schema.maybe(schema.string()) },
  { unknowns: 'ignore' }
);

const triggerSchema = schema.object(
  {
    id: schema.maybe(schema.string()),
    name: schema.maybe(schema.string()),
    severity: schema.maybe(schema.oneOf([schema.string(), schema.number()])),
    condition: schema.maybe(schema.object({ script: scriptSchema }, { unknowns: 'ignore' })),
    actions: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'ignore' }))),
    // Type-specific trigger wrappers (OS returns different keys per monitor_type)
    query_level_trigger: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
    bucket_level_trigger: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
    doc_level_trigger: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
  },
  { unknowns: 'ignore' }
);

const inputSchema = schema.object(
  {
    search: schema.maybe(
      schema.object(
        {
          indices: schema.maybe(schema.arrayOf(schema.string())),
          query: schema.maybe(schema.any()),
        },
        { unknowns: 'ignore' }
      )
    ),
    uri: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
    doc_level_input: schema.maybe(
      schema.object(
        {
          description: schema.maybe(schema.string()),
          indices: schema.maybe(schema.arrayOf(schema.string())),
          queries: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'ignore' }))),
        },
        { unknowns: 'ignore' }
      )
    ),
  },
  { unknowns: 'ignore' }
);

const scheduleSchema = schema.object(
  {
    period: schema.maybe(
      schema.object({ interval: schema.number(), unit: schema.string() }, { unknowns: 'ignore' })
    ),
    cron: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
  },
  { unknowns: 'ignore' }
);

const monitorBodySchema = schema.object({
  name: schema.string(),
  type: schema.maybe(schema.string()),
  monitor_type: schema.maybe(schema.string()),
  enabled: schema.maybe(schema.boolean()),
  schedule: schema.maybe(scheduleSchema),
  inputs: schema.maybe(schema.arrayOf(inputSchema)),
  triggers: schema.maybe(schema.arrayOf(triggerSchema)),
  schema_version: schema.maybe(schema.number()),
});

// ---------------------------------------------------------------------------
// Registrar
// ---------------------------------------------------------------------------

export function registerAlertingMutationRoutes(
  router: IRouter,
  mutationSvc: MonitorMutationService,
  getClient: AlertingClientResolver
): void {
  // POST /api/alerting/opensearch/{dsId}/monitors — create monitor
  router.post(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors',
      validate: { params: schema.object({ dsId: schema.string() }), body: monitorBodySchema },
    },
    async (ctx, req, res) => {
      const result = await handleCreateOSMonitor(
        mutationSvc,
        await getClient(ctx, req.params.dsId),
        // OSD schema validates loosely; narrow to the typed domain shape
        (req.body as unknown) as Omit<OSMonitor, 'id'>
      );
      return res.ok({ body: result.body });
    }
  );

  // PUT /api/alerting/opensearch/{dsId}/monitors/{monitorId} — update monitor
  router.put(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: {
        params: schema.object({ dsId: schema.string(), monitorId: schema.string() }),
        body: monitorBodySchema,
      },
    },
    async (ctx, req, res) => {
      const result = await handleUpdateOSMonitor(
        mutationSvc,
        await getClient(ctx, req.params.dsId),
        req.params.monitorId,
        // OSD schema validates loosely; narrow to the typed domain shape
        (req.body as unknown) as Partial<OSMonitor>
      );
      if (result.status === 200) return res.ok({ body: result.body });
      if (result.status === 404) return res.notFound({ body: toErrorBody(result.body) });
      if (result.status === 409) {
        return res.conflict({ body: toErrorBody(result.body) });
      }
      return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
    }
  );

  // DELETE /api/alerting/opensearch/{dsId}/monitors/{monitorId} — delete monitor
  router.delete(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: { params: schema.object({ dsId: schema.string(), monitorId: schema.string() }) },
    },
    async (ctx, req, res) => {
      try {
        const client = await getClient(ctx, req.params.dsId);
        const result = await handleDeleteOSMonitor(mutationSvc, client, req.params.monitorId);
        if (result.status === 200) return res.ok({ body: result.body });
        if (result.status === 404) return res.notFound({ body: toErrorBody(result.body) });
        return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
      } catch (_e) {
        return res.badRequest({ body: { message: `Invalid datasource: ${req.params.dsId}` } });
      }
    }
  );

  // POST /api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge — ack alerts
  router.post(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge',
      validate: {
        params: schema.object({ dsId: schema.string(), monitorId: schema.string() }),
        body: schema.object({ alerts: schema.arrayOf(schema.string(), { maxSize: 1000 }) }),
      },
    },
    async (ctx, req, res) => {
      const result = await handleAcknowledgeOSAlerts(
        mutationSvc,
        await getClient(ctx, req.params.dsId),
        req.params.monitorId,
        req.body
      );
      return res.ok({ body: result.body });
    }
  );
}
