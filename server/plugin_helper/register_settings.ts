/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { i18n } from '@osd/i18n';
import { UiSettingsServiceSetup } from '../../../../src/core/server/ui_settings';
import {
  DATA_PREPPER_INDEX_NAME,
  DATA_PREPPER_SERVICE_INDEX_NAME,
  DEFAULT_CORRELATED_LOGS_FIELD_MAPPINGS,
  DEFAULT_SS4O_LOGS_INDEX,
  DEFAULT_SERVICE_MAP_MAX_NODES,
  DEFAULT_SERVICE_MAP_MAX_EDGES,
  TRACE_CORRELATED_LOGS_INDEX_SETTING,
  TRACE_CUSTOM_MODE_DEFAULT_SETTING,
  TRACE_CUSTOM_SERVICE_INDEX_SETTING,
  TRACE_CUSTOM_SPAN_INDEX_SETTING,
  TRACE_LOGS_FIELD_MAPPNIGS_SETTING,
  TRACE_SERVICE_MAP_MAX_NODES,
  TRACE_SERVICE_MAP_MAX_EDGES,
} from '../../common/constants/trace_analytics';

export const registerObservabilityUISettings = (uiSettings: UiSettingsServiceSetup) => {
  uiSettings.register({
    [TRACE_CUSTOM_SPAN_INDEX_SETTING]: {
      name: i18n.translate('observability.traceAnalyticsCustomSpanIndices.name', {
        defaultMessage: 'Trace analytics span indices',
      }),
      value: DATA_PREPPER_INDEX_NAME,
      category: ['Observability'],
      description: i18n.translate('observability.traceAnalyticsCustomSpanIndices.description', {
        defaultMessage:
          'Configure span indices that adhere to Data Prepper schema, to be used by the trace analytics plugin',
      }),
      schema: schema.string(),
    },
  });

  uiSettings.register({
    [TRACE_CUSTOM_SERVICE_INDEX_SETTING]: {
      name: i18n.translate('observability.traceAnalyticsCustomServiceIndices.name', {
        defaultMessage: 'Trace analytics service indices',
      }),
      value: DATA_PREPPER_SERVICE_INDEX_NAME,
      category: ['Observability'],
      description: i18n.translate('observability.traceAnalyticsCustomServiceIndices.description', {
        defaultMessage:
          'Configure service indices that adhere to Data Prepper schema, to be used by the trace analytics plugin',
      }),
      schema: schema.string(),
    },
  });

  uiSettings.register({
    [TRACE_CUSTOM_MODE_DEFAULT_SETTING]: {
      name: i18n.translate('observability.traceAnalyticsCustomModeDefault.name', {
        defaultMessage: 'Trace analytics default mode',
      }),
      value: false,
      category: ['Observability'],
      description: i18n.translate('observability.traceAnalyticsCustomModeDefault.description', {
        defaultMessage: 'Enable this to default to Data Prepper mode in the trace analytics plugin',
      }),
      schema: schema.boolean(),
    },
  });

  uiSettings.register({
    [TRACE_CORRELATED_LOGS_INDEX_SETTING]: {
      name: i18n.translate('observability.traceAnalyticsCorrelatedLogsIndices.name', {
        defaultMessage: 'Trace analytics correlated logs indices',
      }),
      value: DEFAULT_SS4O_LOGS_INDEX,
      category: ['Observability'],
      description: i18n.translate('observability.traceAnalyticsCorrelatedLogsIndices.description', {
        defaultMessage:
          'Configure correlated logs indices, to be used by the trace analytics plugin to correlate spans and services to logs',
      }),
      schema: schema.string(),
    },
  });

  uiSettings.register({
    [TRACE_LOGS_FIELD_MAPPNIGS_SETTING]: {
      name: i18n.translate('observability.traceAnalyticsCorrelatedLogsFieldMappings.name', {
        defaultMessage: 'Trace analytics correlated logs fields',
      }),
      value: DEFAULT_CORRELATED_LOGS_FIELD_MAPPINGS,
      category: ['Observability'],
      description: i18n.translate(
        'observability.traceAnalyticsCorrelatedLogsFieldMappings.description',
        {
          defaultMessage:
            'Configure correlated logs fields, to be used by the trace analytics plugin for correlate spans and services to logs',
        }
      ),
      schema: schema.object({
        serviceName: schema.string(),
        spanId: schema.string(),
        timestamp: schema.string(),
        traceId: schema.string(),
      }),
    },
  });

  uiSettings.register({
    [TRACE_SERVICE_MAP_MAX_NODES]: {
      name: i18n.translate('observability.traceAnalyticsServiceMapMaxNodes.name', {
        defaultMessage: 'Trace analytics service map maximum nodes',
      }),
      value: DEFAULT_SERVICE_MAP_MAX_NODES,
      category: ['Observability'],
      description: i18n.translate('observability.traceAnalyticsServiceMapMaxNodes.description', {
        defaultMessage:
          'Set the maximum number of nodes that the trace analytics plugin should request for rendering of service maps',
      }),
      schema: schema.number({
        min: 1,
      }),
    },
  });

  uiSettings.register({
    [TRACE_SERVICE_MAP_MAX_EDGES]: {
      name: i18n.translate('observability.traceAnalyticsServiceMapMaxEdges.name', {
        defaultMessage: 'Trace analytics service map maximum edges',
      }),
      value: DEFAULT_SERVICE_MAP_MAX_EDGES,
      category: ['Observability'],
      description: i18n.translate('observability.traceAnalyticsServiceMapMaxEdges.description', {
        defaultMessage:
          'Set the maximum number of edges that the trace analytics plugin should request for rendering of service maps',
      }),
      schema: schema.number({
        min: 1,
      }),
    },
  });
};
