/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Top-level body schema for monitor create / update routes.
 *
 * The body sent to OpenSearch Alerting carries deeply-nested wrapper shapes
 * that vary by monitor type (`ppl_trigger`, `query_level_trigger`,
 * `bucket_level_trigger`, `doc_level_trigger`). A previous iteration of this
 * file used a fully-typed `monitorBodySchema` with strict inner shapes, but
 * `unknowns: 'ignore'` on the trigger inner objects silently dropped the
 * wrapper field — so we ended up with `body: schema.any()`, removing all
 * structural validation.
 *
 * This schema strikes a middle ground:
 *   - validate top-level monitor fields (`name`, `type`, `monitor_type`,
 *     `enabled`, `schedule`, `inputs`, `triggers`) so payload size and shape
 *     abuse is rejected at the API boundary,
 *   - allow `unknowns: 'allow'` on the nested trigger / input / schedule
 *     objects so wrapper fields and future plugin extensions round-trip.
 */
import { schema } from '@osd/config-schema';

const ALERTING_NAME_MAX = 256;
const PPL_QUERY_MAX = 2000;
const TRIGGERS_MAX = 50;
const INPUTS_MAX = 10;

export const monitorMutationBodySchema = schema.object(
  {
    type: schema.maybe(schema.string({ maxLength: 64 })),
    name: schema.string({ minLength: 1, maxLength: ALERTING_NAME_MAX }),
    monitor_type: schema.maybe(schema.string({ maxLength: 64 })),
    enabled: schema.maybe(schema.boolean()),
    schedule: schema.maybe(schema.object({}, { unknowns: 'allow' })),
    inputs: schema.maybe(
      schema.arrayOf(
        schema.object(
          {
            // PPL inputs carry the query string; bound it here so an
            // oversize body can't reach the alerting plugin. Other input
            // shapes (search_input, etc.) round-trip via `unknowns: 'allow'`.
            ppl_input: schema.maybe(
              schema.object(
                {
                  query: schema.maybe(schema.string({ maxLength: PPL_QUERY_MAX })),
                },
                { unknowns: 'allow' }
              )
            ),
          },
          { unknowns: 'allow' }
        ),
        { maxSize: INPUTS_MAX }
      )
    ),
    triggers: schema.maybe(
      schema.arrayOf(schema.object({}, { unknowns: 'allow' }), { maxSize: TRIGGERS_MAX })
    ),
    ui_metadata: schema.maybe(schema.object({}, { unknowns: 'allow' })),
  },
  { unknowns: 'allow' }
);

// Per-id length bound for acknowledge — backend alert ids are NanoID/UUID
// shaped, so a generous 64 is plenty without letting unbounded strings reach
// the alerting plugin.
const ACK_ID_MAX = 64;
const ACK_BATCH_MAX = 1000;

export const monitorAcknowledgeBodySchema = schema.object({
  alerts: schema.arrayOf(schema.string({ minLength: 1, maxLength: ACK_ID_MAX }), {
    maxSize: ACK_BATCH_MAX,
  }),
});

// Re-exported for tests / docs.
export const SCHEMA_LIMITS = {
  ALERTING_NAME_MAX,
  PPL_QUERY_MAX,
  TRIGGERS_MAX,
  INPUTS_MAX,
  ACK_ID_MAX,
  ACK_BATCH_MAX,
};
