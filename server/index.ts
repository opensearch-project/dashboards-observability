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
      enabled: schema.boolean({ defaultValue: false }),
      ppl_agent_name: schema.conditional(
        schema.siblingRef('enabled'),
        true,
        schema.string(),
        schema.maybe(schema.string())
      ),
    }),
    summarize: schema.object({
      enabled: schema.boolean({ defaultValue: false }),
      response_summary_agent_name: schema.conditional(
        schema.siblingRef('enabled'),
        true,
        schema.string(),
        schema.maybe(schema.string())
      ),
      error_summary_agent_name: schema.conditional(
        schema.siblingRef('enabled'),
        true,
        schema.string(),
        schema.maybe(schema.string())
      ),
    }),
  }),
};

export type ObservabilityConfig = TypeOf<typeof observabilityConfig.schema>;

export const config: PluginConfigDescriptor<ObservabilityConfig> = {
  schema: observabilityConfig.schema,
  exposeToBrowser: {
    query_assist: true,
    summarize: true,
  },
};
