/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import { schema } from '@osd/config-schema';
import { UiSettingsServiceSetup } from '../../../../src/core/server/ui_settings';
import {
  TRACE_CUSTOM_MODE_DEFAULT_SETTING,
  TRACE_CUSTOM_SERVICE_INDEX_SETTING,
  TRACE_CUSTOM_SPAN_INDEX_SETTING,
} from '../../common/constants/trace_analytics';

export const registerObservabilityUISettings = (uiSettings: UiSettingsServiceSetup) => {
  uiSettings.register({
    [TRACE_CUSTOM_SPAN_INDEX_SETTING]: {
      name: i18n.translate('observability.traceAnalyticsCustomSpanIndices.name', {
        defaultMessage: 'Trace analytics custom span indices',
      }),
      value: '',
      category: ['Observability'],
      description: i18n.translate('observability.traceAnalyticsCustomSpanIndices.description', {
        defaultMessage:
          '<strong>Experimental feature:</strong> Configure custom span indices that adhere to data prepper schema, to be used by the trace analytics plugin',
      }),
      schema: schema.string(),
    },
  });

  uiSettings.register({
    [TRACE_CUSTOM_SERVICE_INDEX_SETTING]: {
      name: i18n.translate('observability.traceAnalyticsCustomServiceIndices.name', {
        defaultMessage: 'Trace analytics custom service indices',
      }),
      value: '',
      category: ['Observability'],
      description: i18n.translate('observability.traceAnalyticsCustomServiceIndices.description', {
        defaultMessage:
          '<strong>Experimental feature:</strong> Configure custom service indices that adhere to data prepper schema, to be used by the trace analytics plugin',
      }),
      schema: schema.string(),
    },
  });

  uiSettings.register({
    [TRACE_CUSTOM_MODE_DEFAULT_SETTING]: {
      name: i18n.translate('observability.traceAnalyticsCustomModeDefault.name', {
        defaultMessage: 'Trace analytics custom mode default',
      }),
      value: false,
      category: ['Observability'],
      description: i18n.translate('observability.traceAnalyticsCustomModeDefault.description', {
        defaultMessage:
          '<strong>Experimental feature:</strong> Enable this to default to "custom_data_prepper" mode in the trace analytics plugin',
      }),
      schema: schema.boolean(),
    },
  });
};
