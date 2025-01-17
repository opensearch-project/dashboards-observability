/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable radix */

import dateMath from '@elastic/datemath';
import {
  EuiButtonIcon,
  EuiEmptyPrompt,
  EuiOverlayMask,
  EuiSmallButtonEmpty,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { SpacerSize } from '@elastic/eui/src/components/spacer/spacer';
import { isEmpty, round } from 'lodash';
import React from 'react';
import {
  DATA_PREPPER_INDEX_NAME,
  DATA_PREPPER_SERVICE_INDEX_NAME,
  JAEGER_INDEX_NAME,
  JAEGER_SERVICE_INDEX_NAME,
  TRACE_ANALYTICS_DOCUMENTATION_LINK,
  TRACE_CUSTOM_SERVICE_INDEX_SETTING,
  TRACE_CUSTOM_SPAN_INDEX_SETTING,
} from '../../../../../common/constants/trace_analytics';
import {
  GraphVisEdge,
  GraphVisNode,
  TraceAnalyticsMode,
} from '../../../../../common/types/trace_analytics';
import { uiSettingsService } from '../../../../../common/utils';
import { FieldCapResponse } from '../../../common/types';
import { serviceMapColorPalette } from './color_palette';
import { FilterType } from './filters/filters';
import { ServiceObject } from './plots/service_map';

const missingJaegerTracesConfigurationMessage = `The indices required for trace analytics (${JAEGER_INDEX_NAME} and ${JAEGER_SERVICE_INDEX_NAME}) do not exist or you do not have permission to access them.`;

const missingDataPrepperTracesConfigurationMessage = `The indices required for trace analytics (${DATA_PREPPER_INDEX_NAME} and ${DATA_PREPPER_SERVICE_INDEX_NAME}) do not exist or you do not have permission to access them.`;

export function PanelTitle({ title, totalItems }: { title: string; totalItems?: number }) {
  return (
    <EuiText size="m">
      <span className="panel-title">{title}</span>
      {totalItems === 0 || totalItems ? (
        <span className="panel-title-count">{` (${totalItems})`}</span>
      ) : null}
    </EuiText>
  );
}

export function NoMatchMessage(props: { size: SpacerSize }) {
  return (
    <>
      <EuiSpacer size={props.size} />
      <EuiEmptyPrompt
        title={<h2>No matches</h2>}
        body={
          <EuiText size="s">
            No data matches the selected filter. Clear the filter and/or increase the time range to
            see more results.
          </EuiText>
        }
      />
      <EuiSpacer size={props.size} />
    </>
  );
}

export function MissingConfigurationMessage(props: { mode: TraceAnalyticsMode }) {
  const missingConfigurationBody =
    props.mode === 'jaeger'
      ? missingJaegerTracesConfigurationMessage
      : missingDataPrepperTracesConfigurationMessage;
  return (
    <>
      <EuiEmptyPrompt
        title={<h2>Trace Analytics not set up</h2>}
        body={<EuiText size="s">{missingConfigurationBody}</EuiText>}
        actions={
          <EuiSmallButtonEmpty
            color="primary"
            iconSide="right"
            iconType="popout"
            onClick={() => window.open(TRACE_ANALYTICS_DOCUMENTATION_LINK, '_blank')}
          >
            Learn more
          </EuiSmallButtonEmpty>
        }
      />
    </>
  );
}

// Processes time (like 'now-5y') to microseconds for jaeger since this is how they store the start time. Otherwise leave it the same.
export function processTimeStamp(time: string, mode: TraceAnalyticsMode) {
  if (mode === 'jaeger') {
    const timeMoment = dateMath.parse(time)!;
    return timeMoment.unix() * 1000000;
  }
  return time;
}

export function renderBenchmark(value: number) {
  if (typeof value !== 'number') return null;
  const benchmarkColor = value === 0 ? '#9ea8a9' : value > 0 ? '#c23f25' : '#3f7e23';
  const benchmarkArrow = value === 0 ? '-' : value > 0 ? '\u25B4' : '\u25BE';
  return (
    <EuiText size="s" style={{ color: benchmarkColor }}>
      {`${Math.abs(value)}% ${benchmarkArrow}`}
    </EuiText>
  );
}

export function nanoToMilliSec(nano: number) {
  if (typeof nano !== 'number') return 0;
  return nano / 1000000;
}

export const getTimestampPrecision = (timestamp: number): 'millis' | 'micros' | 'nanos' => {
  if (!timestamp) return 'millis';

  const digitCount = timestamp.toString().length;

  // For Unix timestamps:
  // 13 digits = milliseconds (e.g., 1703599200000)
  // 16 digits = microseconds (e.g., 1703599200000000)
  // 19 digits = nanoseconds  (e.g., 1703599200000000000)
  switch (digitCount) {
    case 13:
      return 'millis';
    case 16:
      return 'micros';
    case 19:
      return 'nanos';
    default:
      return 'millis';
  }
};

export const appendModeToTraceViewUri = (
  traceId: string,
  getTraceViewUri?: (traceId: string) => string,
  traceMode?: string | null
): string => {
  const baseUri = getTraceViewUri ? getTraceViewUri(traceId) : '';
  const separator = baseUri.includes('?') ? '&' : '?';

  if (traceMode) {
    return `${baseUri}${separator}mode=${encodeURIComponent(traceMode)}`;
  }
  return baseUri;
};

export function microToMilliSec(micro: number) {
  if (typeof micro !== 'number') return 0;
  return micro / 1000;
}

export function milliToMicroSec(ms: number) {
  if (typeof ms !== 'number') return 0;
  return ms * 1000;
}

export function milliToNanoSec(ms: number) {
  if (typeof ms !== 'number') return 0;
  return ms * 1000000;
}

export function getServiceMapScaleColor(
  percent: number,
  idSelected: 'latency' | 'error_rate' | 'throughput'
) {
  return serviceMapColorPalette[idSelected][Math.min(99, Math.max(0, Math.floor(percent * 100)))];
}

function filterGraphBySelectedNode(
  nodes: GraphVisNode[],
  edges: GraphVisEdge[],
  selectedNodeLabel: string
): { graph: { nodes: GraphVisNode[]; edges: GraphVisEdge[] } } {
  // Find the selected node's id
  const selectedNode = nodes.find((node) => node.label === selectedNodeLabel);
  if (!selectedNode) {
    return { graph: { nodes, edges } };
  }

  const selectedNodeId = selectedNode.id;

  // Filter edges to include only those that are connected to the selected node
  const connectedEdges = edges.filter(
    (edge) => edge.from === selectedNodeId || edge.to === selectedNodeId
  );

  // Get the set of connected node ids
  const connectedNodeIds = new Set<number>();
  connectedNodeIds.add(selectedNodeId);
  connectedEdges.forEach((edge) => {
    connectedNodeIds.add(edge.from);
    connectedNodeIds.add(edge.to);
  });

  // Filter nodes to include only those that are connected
  const connectedNodes = nodes.filter((node) => connectedNodeIds.has(node.id));

  return { graph: { nodes: connectedNodes, edges: connectedEdges } };
}

// construct vis-js graph from ServiceObject
export function getServiceMapGraph(
  map: ServiceObject,
  idSelected: 'latency' | 'error_rate' | 'throughput',
  ticks: number[],
  currService?: string,
  relatedServices?: string[],
  filterByCurrService?: boolean
) {
  if (!relatedServices) relatedServices = Object.keys(map);

  const nodes = Object.keys(map).map((service) => {
    const value = map[service][idSelected];
    let styleOptions;
    if (value || value === 0) {
      const percent = (value - ticks[0]) / (ticks[ticks.length - 1] - ticks[0]);
      const color = getServiceMapScaleColor(percent, idSelected);
      styleOptions = {
        borderWidth: 3,
        color: {
          border: '#4A4A4A',
          background: `rgba(${color}, 1)`,
        },
        font: {
          color: `rgba(72, 122, 180, 1)`,
        },
      };
    } else {
      styleOptions = {
        borderWidth: 3,
        chosen: false,
        color: {
          border: '#4A4A4A',
          background: '#FFFFFF',
        },
      };
    }

    const averageLatency = `Average duration: ${
      map[service].latency! >= 0 ? map[service].latency + 'ms' : '-'
    }`;

    const errorRate = `Error rate: ${
      map[service].error_rate! >= 0 ? map[service].error_rate + '%' : '-'
    }`;

    const throughput =
      'Request rate: ' +
      (map[service].throughput! >= 0 ? `${map[service].throughput}` : '-') +
      (map[service].throughputPerMinute ? ` (${map[service].throughputPerMinute} per minute)` : '');

    const hover = `${service}\n\n ${averageLatency} \n ${errorRate} \n ${throughput}`;

    return {
      id: map[service].id,
      label: service,
      size: service === currService ? 30 : 15,
      title: hover,
      average_latency: averageLatency,
      error_rate: errorRate,
      throughput,
      ...styleOptions,
    };
  });
  const edges: Array<{ from: number; to: number; color: string }> = [];
  const edgeColor = uiSettingsService.get('theme:darkMode') ? '255, 255, 255' : '0, 0, 0';
  Object.keys(map).map((service) => {
    map[service].targetServices
      .filter((target) => map[target])
      .map((target) => {
        edges.push({
          from: map[service].id,
          to: map[target].id,
          color: `rgba(${edgeColor}, 1)`,
        });
      });
  });

  if (filterByCurrService && currService) {
    return filterGraphBySelectedNode(nodes, edges, currService);
  }
  return { graph: { nodes, edges } };
}

export function calculateTicks(min: number, max: number, numTicks = 5): number[] {
  if (min >= max) return calculateTicks(0, Math.max(1, max), numTicks);
  min = Math.floor(min);
  max = Math.ceil(max);

  const range = max - min;
  const minInterval = range / numTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(minInterval)));
  const residue = Math.ceil(minInterval / magnitude);

  let tick = magnitude;
  if (residue > 5) tick *= 10;
  else if (residue > 2) tick *= 5;
  else if (residue > 1) tick *= 2;

  let curr = Math.max(0, Math.floor((min - 1) / tick) * tick);
  const ticks = [curr];
  while (curr < max) {
    curr = round(curr + tick, 1);
    ticks.push(curr);
  }

  return ticks;
}

// calculates the minimum fixed_interval for date_histogram from time filter
export const minFixedInterval = (startTime: string, endTime: string) => {
  if (startTime?.length === 0 || endTime?.length === 0 || startTime === endTime) return '1d';
  const momentStart = dateMath.parse(startTime)!;
  const momentEnd = dateMath.parse(endTime, { roundUp: true })!;
  const diffSeconds = momentEnd.unix() - momentStart.unix();

  if (diffSeconds <= 1) return '1ms'; // less than 1 second
  if (diffSeconds <= 60 * 2) return '1s'; // less than 2 minutes
  if (diffSeconds <= 3600 * 2) return '1m'; // less than 2 hours
  if (diffSeconds <= 86400 * 2) return '1h'; // less than 2 days
  if (diffSeconds <= 86400 * 62) return '1d'; // less than 2 months
  if (diffSeconds <= 86400 * 366) return '30d'; // less than 1 year
  return '365d';
};

export const fixedIntervalToMilli = (fixedInterval: string) => {
  return {
    '1ms': 1,
    '1s': 1000,
    '1m': 60000,
    '1h': 3600000,
    '1d': 86400000,
    '30d': 86400000 * 30,
    '365d': 86400000 * 365,
  }[fixedInterval];
};

export const fixedIntervalToTickFormat = (fixedInterval: string) => {
  if (fixedInterval === '1d') return '%b %e, %Y';
  if (fixedInterval === '30d') return '%b %Y';
  if (fixedInterval === '365d') return '%Y';
  return '';
};

export const getPercentileFilter = (
  percentileMaps: Array<{ traceGroupName: string; durationFilter: { gte?: number; lte?: number } }>,
  conditionString: string // >= 95th, < 95th
): FilterType => {
  const DSL: any = {
    query: {
      bool: {
        must: [],
        filter: [],
        should: [],
        must_not: [],
        minimum_should_match: 1,
      },
    },
  };
  percentileMaps.forEach((map) => {
    DSL.query.bool.should.push({
      bool: {
        must: [
          {
            term: {
              traceGroup: {
                value: map.traceGroupName,
              },
            },
          },
          {
            range: {
              'traceGroupFields.durationInNanos': map.durationFilter,
            },
          },
        ],
      },
    });
  });
  return {
    field: 'Latency percentile within trace group',
    operator: '',
    value: conditionString,
    inverted: false,
    disabled: false,
    custom: DSL,
  };
};

export const filtersToDsl = (
  mode: TraceAnalyticsMode,
  filters: FilterType[],
  query: string,
  startTime: any,
  endTime: any,
  page?: string,
  appConfigs: FilterType[] = []
) => {
  const DSL: any = {
    query: {
      bool: {
        must: [],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    custom: {
      timeFilter: [],
      serviceNames: [],
      serviceNamesExclude: [],
      traceGroup: [],
      traceGroupExclude: [],
      percentiles: {
        query: {
          bool: {
            should: [],
          },
        },
      },
    },
  };
  const timeFilter = {
    range: {
      startTime: {
        gte: startTime,
        lte: endTime,
      },
    },
  };
  DSL.query.bool.filter.push(timeFilter);
  DSL.custom.timeFilter.push(timeFilter);
  if (query.length > 0) {
    DSL.query.bool.filter.push({
      query_string: {
        query,
      },
    });
  }

  filters
    .filter((filter) => !filter.disabled && !filter.locked)
    .forEach((filter) => {
      if (filter.custom?.query) {
        // add percentile filter
        DSL.query.bool.should.push(...filter.custom.query.bool.should);
        DSL.custom.percentiles.query.bool.should.push(...filter.custom.query.bool.should);
        DSL.query.bool.minimum_should_match = filter.custom.query.bool.minimum_should_match;
        DSL.custom.percentiles.query.bool.minimum_should_match =
          filter.custom.query.bool.minimum_should_match;
        return;
      }

      let filterQuery = {};
      let field = filter.field;
      if (field === 'latency') {
        if (mode === 'data_prepper' || mode === 'custom_data_prepper') {
          field = 'traceGroupFields.durationInNanos';
        } else if (mode === 'jaeger') {
          field = 'duration';
        }
      } else if (field === 'error') {
        if (mode === 'data_prepper' || mode === 'custom_data_prepper') {
          field = 'traceGroupFields.statusCode';
        } else if (mode === 'jaeger') {
          field = 'tag.error';
        }
      }
      let value;

      switch (filter.operator) {
        case 'exists':
        case 'does not exist':
          filterQuery = {
            exists: {
              field,
            },
          };
          break;

        case 'is':
        case 'is not':
          value = filter.value;
          // latency and error are not actual fields, need to convert first
          if (field === 'traceGroupFields.durationInNanos') {
            value = milliToNanoSec(value);
          } else if (field === 'traceGroupFields.statusCode') {
            value = value[0].label === 'true' ? '2' : '0';
          } else if (field === 'duration') {
            value = milliToMicroSec(parseFloat(value));
          } else if (field === 'tag.error') {
            value = value[0].label === 'true' ? true : false;
          }

          filterQuery = {
            term: {
              [field]: value,
            },
          };
          break;

        case 'is between':
        case 'is not between':
          const range: { gte?: string; lte?: string } = {};
          if (!filter.value.from.includes('\u221E')) range.gte = filter.value.from;
          if (!filter.value.to.includes('\u221E')) range.lte = filter.value.to;
          if (field === 'traceGroupFields.durationInNanos') {
            if (range.lte) range.lte = milliToNanoSec(parseInt(range.lte || '')).toString();
            if (range.gte) range.gte = milliToNanoSec(parseInt(range.gte || '')).toString();
          }
          if (field === 'duration') {
            if (range.lte) range.lte = milliToMicroSec(parseInt(range.lte || '')).toString();
            if (range.gte) range.gte = milliToMicroSec(parseInt(range.gte || '')).toString();
          }
          filterQuery = {
            range: {
              [field]: range,
            },
          };
          break;

        default:
          break;
      }
      DSL.query.bool[filter.inverted ? 'must_not' : 'must'].push(filterQuery);
    });

  if (page === 'app' && !isEmpty(appConfigs)) {
    DSL.query.bool.minimum_should_match = 1;
    appConfigs.forEach((config) => {
      let appQuery = {};
      const appField = config.field;
      const appValue = config.value;
      appQuery = {
        term: {
          [appField]: appValue,
        },
      };
      DSL.query.bool.minimum_should_match = 1;
      DSL.query.bool.should.push(appQuery);
    });
  }

  return DSL;
};

export const getAttributeFieldNames = (response: FieldCapResponse): string[] => {
  return Object.keys(response.fields).filter(
    (field) => field.startsWith('resource.attributes') || field.startsWith('span.attributes')
  );
};

export const getTraceCustomSpanIndex = () => {
  return uiSettingsService.get(TRACE_CUSTOM_SPAN_INDEX_SETTING);
};

export const getTraceCustomServiceIndex = () => {
  return uiSettingsService.get(TRACE_CUSTOM_SERVICE_INDEX_SETTING);
};

export const setTraceCustomSpanIndex = (value: string) => {
  return uiSettingsService.set(TRACE_CUSTOM_SPAN_INDEX_SETTING, value);
};

export const setTraceCustomServiceIndex = (value: string) => {
  return uiSettingsService.set(TRACE_CUSTOM_SERVICE_INDEX_SETTING, value);
};

export const getSpanIndices = (mode: TraceAnalyticsMode) => {
  switch (mode) {
    case 'custom_data_prepper':
      return getTraceCustomSpanIndex();
    case 'data_prepper':
      return DATA_PREPPER_INDEX_NAME;
    case 'jaeger':
    default:
      return JAEGER_INDEX_NAME;
  }
};

export const getServiceIndices = (mode: TraceAnalyticsMode) => {
  switch (mode) {
    case 'custom_data_prepper':
      return getTraceCustomServiceIndex();
    case 'data_prepper':
      return DATA_PREPPER_SERVICE_INDEX_NAME;
    case 'jaeger':
    default:
      return JAEGER_SERVICE_INDEX_NAME;
  }
};

export const generateServiceUrl = (
  service: string,
  dataSourceId: string,
  mode?: TraceAnalyticsMode
): string => {
  let url = `#/services?serviceId=${encodeURIComponent(service)}`;

  if (dataSourceId && dataSourceId !== '') {
    url += `&datasourceId=${encodeURIComponent(dataSourceId)}`;
  }

  if (mode) {
    url += `&mode=${encodeURIComponent(mode)}`;
  }

  return url;
};

interface FullScreenWrapperProps {
  children: React.ReactNode;
  onClose: () => void;
  isFullScreen: boolean;
}

// EUI Data grid full screen button is currently broken, this is a workaround
export const FullScreenWrapper: React.FC<FullScreenWrapperProps> = ({
  children,
  onClose,
  isFullScreen,
}) => {
  if (!isFullScreen) return <>{children}</>;

  return (
    <EuiOverlayMask>
      <div className="full-screen-wrapper">
        <EuiButtonIcon
          iconType="cross"
          aria-label="Close full screen"
          onClick={onClose}
          display="empty"
          className="full-screen-close-icon"
        />
        <div className="full-screen-content">{children}</div>
      </div>
    </EuiOverlayMask>
  );
};
