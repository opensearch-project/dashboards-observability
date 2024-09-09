/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { UiSettingsServiceSetup } from '../../../../src/core/server/ui_settings';
import {
  TRACE_CUSTOM_SERVICE_INDEX_SETTING,
  TRACE_CUSTOM_SPAN_INDEX_SETTING,
} from '../../common/constants/trace_analytics';

export const registerObservabilityUISettings = (uiSettings: UiSettingsServiceSetup) => {
  uiSettings.register({
    [TRACE_CUSTOM_SPAN_INDEX_SETTING]: {
      name: 'Trace analytics custom span indices',
      value: '',
      category: ['Observability'],
      description:
        '<strong>Experimental feature:</strong> Configure custom span indices that adhere to data prepper schema, to be used by the trace analytics plugin',
      schema: schema.string(),
    },
  });

  uiSettings.register({
    [TRACE_CUSTOM_SERVICE_INDEX_SETTING]: {
      name: 'Trace analytics custom service indices',
      value: '',
      category: ['Observability'],
      description:
        '<strong>Experimental feature:</strong> Configure custom service indices that adhere to data prepper schema, to be used by the trace analytics plugin',
      schema: schema.string(),
    },
  });
};
