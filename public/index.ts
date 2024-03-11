/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PluginInitializerContext } from '../../../src/core/public';
import './components/notebooks/index.scss';
import './components/trace_analytics/index.scss';
import { ObservabilityPlugin } from './plugin';
import './variables.scss';

export { ObservabilityPlugin as Plugin };

export const plugin = (initializerContext: PluginInitializerContext) =>
  new ObservabilityPlugin(initializerContext);

export { ObservabilityStart } from './types';
