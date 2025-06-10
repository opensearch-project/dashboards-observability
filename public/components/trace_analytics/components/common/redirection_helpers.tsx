/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import dateMath from '@elastic/datemath';
import moment from 'moment';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public/components/data_source_menu/types';
import {
  DEFAULT_DATA_SOURCE_NAME,
  DEFAULT_DATA_SOURCE_TYPE,
} from '../../../../../common/constants/data_sources';
import {
  observabilityLogsID,
  observabilityTracesNewNavID,
} from '../../../../../common/constants/shared';
import { TRACE_ANALYTICS_DATE_FORMAT } from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { coreRefs } from '../../../../framework/core_refs';
import { FilterType } from './filters/filters';
import { TraceSettings } from './helper_functions';

const redirectionToLogsApp = ({
  startTime,
  endTime,
  dataSourceMDSId,
  correlatedFieldName,
  correlatedFieldValue,
}: {
  startTime: string;
  endTime: string;
  dataSourceMDSId: DataSourceOption[];
  correlatedFieldName: string;
  correlatedFieldValue: string;
}) => {
  const correlatedLogsIndex = TraceSettings.getCorrelatedLogsIndex();
  const correlatedTimestampField = TraceSettings.getCorrelatedLogsFieldMappings().timestamp;
  if (coreRefs?.dataSource?.dataSourceEnabled || coreRefs.chrome?.navGroup.getNavGroupEnabled()) {
    coreRefs?.application!.navigateToApp('data-explorer', {
      path: `discover#?_a=(discover:(columns:!(_source),isDirty:!f,sort:!()),metadata:(view:discover))&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:'${startTime}',to:'${endTime}'))&_q=(filters:!(),query:(dataset:(dataSource:(id:'${
        dataSourceMDSId[0].id ?? ''
      }',title:'${dataSourceMDSId[0].label}',type:DATA_SOURCE),id:'${
        dataSourceMDSId[0].id ?? ''
      }::${correlatedLogsIndex}',timeFieldName:'${correlatedTimestampField}',title:'${correlatedLogsIndex}',type:INDEXES),language:PPL,query:'${encodeURIComponent(
        `source = ${correlatedLogsIndex} | where ${correlatedFieldName} = "${correlatedFieldValue}"`
      )}'))`,
    });
  } else {
    coreRefs?.application!.navigateToApp(observabilityLogsID, {
      path: `#/explorer`,
      state: {
        DEFAULT_DATA_SOURCE_NAME,
        DEFAULT_DATA_SOURCE_TYPE,
        queryToRun: `source = ${correlatedLogsIndex} | where ${correlatedFieldName}='${correlatedFieldValue}'`,
        timestampField: correlatedTimestampField,
        startTimeRange: startTime,
        endTimeRange: endTime,
      },
    });
  }
};

export const redirectToServiceLogs = ({
  fromTime,
  toTime,
  dataSourceMDSId,
  serviceName,
}: {
  fromTime: string;
  toTime: string;
  dataSourceMDSId: DataSourceOption[];
  serviceName: string;
}) => {
  const correlatedServiceNameField = TraceSettings.getCorrelatedLogsFieldMappings().serviceName;
  const startTime = dateMath.parse(fromTime)!.format(TRACE_ANALYTICS_DATE_FORMAT) ?? 'now-30m';
  const endTime =
    dateMath.parse(toTime, { roundUp: true })!.format(TRACE_ANALYTICS_DATE_FORMAT) ?? 'now';
  redirectionToLogsApp({
    startTime,
    endTime,
    dataSourceMDSId,
    correlatedFieldName: correlatedServiceNameField,
    correlatedFieldValue: serviceName,
  });
};

export const redirectSpansToLogs = ({
  fromTime,
  toTime,
  dataSourceMDSId,
  spanId,
}: {
  fromTime: string;
  toTime: string;
  dataSourceMDSId: Array<{ id: string; label: string }>;
  spanId: string;
}) => {
  const correlatedSpanField = TraceSettings.getCorrelatedLogsFieldMappings().spanId;
  // For telemetry lag, moving time range to +-30 minutes of startTime and endTime
  const startTime =
    moment(fromTime).subtract(30, 'minutes').format(TRACE_ANALYTICS_DATE_FORMAT) ?? 'now-30m';
  const endTime = moment(toTime).add(30, 'minutes').format(TRACE_ANALYTICS_DATE_FORMAT) ?? 'now';
  redirectionToLogsApp({
    startTime,
    endTime,
    dataSourceMDSId,
    correlatedFieldName: correlatedSpanField,
    correlatedFieldValue: spanId,
  });
};

export const redirectTraceToLogs = ({
  fromTime,
  toTime,
  traceId,
  dataSourceMDSId,
}: {
  fromTime: string;
  toTime: string;
  traceId: string;
  dataSourceMDSId: DataSourceOption[];
}) => {
  const correlatedTraceIdField = TraceSettings.getCorrelatedLogsFieldMappings().traceId;
  // For telemetry lag, moving time range to +-30 minutes of startTime and endTime
  const startTime =
    moment(fromTime).subtract(30, 'minutes').format(TRACE_ANALYTICS_DATE_FORMAT) ?? 'now-30m';
  const endTime = moment(toTime).add(30, 'minutes').format(TRACE_ANALYTICS_DATE_FORMAT) ?? 'now';
  redirectionToLogsApp({
    startTime,
    endTime,
    dataSourceMDSId,
    correlatedFieldName: correlatedTraceIdField,
    correlatedFieldValue: traceId,
  });
};

export const redirectToServiceTraces = ({
  mode,
  addFilter,
  dataSourceMDSId,
  serviceName,
}: {
  mode: TraceAnalyticsMode;
  addFilter: (filter: FilterType) => void;
  dataSourceMDSId: DataSourceOption[];
  serviceName: string;
}) => {
  const newNavigation = coreRefs.chrome?.navGroup.getNavGroupEnabled();
  const filterField = mode === 'data_prepper' ? 'serviceName' : 'process.serviceName';
  addFilter({
    field: filterField,
    operator: 'is',
    value: serviceName,
    inverted: false,
    disabled: false,
  });

  const tracesPath = '#/traces';
  const dataSourceId = dataSourceMDSId[0]?.id || '';
  const urlParts = window.location.href.split('?');
  const queryParams =
    urlParts.length > 1 ? new URLSearchParams(urlParts[1]) : new URLSearchParams();

  const modeParam = queryParams.get('mode') || '';
  const modeQuery = modeParam ? `&mode=${encodeURIComponent(modeParam)}` : '';

  if (newNavigation) {
    coreRefs.application?.navigateToApp(observabilityTracesNewNavID, {
      path: `${tracesPath}?datasourceId=${encodeURIComponent(dataSourceId)}${modeQuery}`,
    });
  } else {
    window.location.assign(
      `${tracesPath}?datasourceId=${encodeURIComponent(dataSourceId)}${modeQuery}`
    );
  }
};
