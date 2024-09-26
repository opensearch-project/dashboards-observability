/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PropertySort } from '@elastic/eui';
import { TRACES_MAX_NUM } from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode, TraceQueryMode } from '../../../../../common/types/trace_analytics';
import { SpanSearchParams } from '../../components/traces/span_detail_table';

export const getTraceGroupPercentilesQuery = () => {
  const query: any = {
    size: 0,
    query: {
      bool: {
        must: [
          {
            term: {
              parentSpanId: {
                value: '',
              },
            },
          },
        ],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    aggs: {
      trace_group_name: {
        terms: {
          field: 'name',
          size: 10000,
        },
        aggs: {
          percentiles: {
            percentiles: {
              field: 'durationInNanos',
              percents: Array.from({ length: 101 }, (v, i) => i),
            },
          },
        },
      },
    },
  };
  return query;
};

export const getTracesQuery = (
  mode: TraceAnalyticsMode,
  traceId: string = '',
  sort?: PropertySort,
  isUnderOneHour?: boolean
) => {
  const field = sort?.field || '_key';
  const direction = sort?.direction || 'asc';
  const jaegerQuery: any = {
    size: 0,
    query: {
      bool: {
        must: [],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    aggs: {
      traces: {
        terms: {
          field: 'traceID',
          size: TRACES_MAX_NUM,
          order: {
            [field]: direction,
          },
          ...(isUnderOneHour && { execution_hint: 'map' }),
        },
        aggs: {
          latency: {
            max: {
              script: {
                source: `
                if (doc.containsKey('duration') && !doc['duration'].empty) {
                  return Math.round(doc['duration'].value) / 1000.0
                }

                return 0
                `,
                lang: 'painless',
              },
            },
          },
          trace_group: {
            terms: {
              field: 'traceGroup',
              size: 1,
            },
          },
          error_count: {
            filter: {
              term: {
                'tag.error': true,
              },
            },
          },
          last_updated: {
            max: {
              script: {
                source: `
                if (doc.containsKey('startTime') && !doc['startTime'].empty && doc.containsKey('duration') && !doc['duration'].empty) {
                  return (Math.round(doc['duration'].value) + Math.round(doc['startTime'].value)) / 1000.0
                }

                return 0
                `,
                lang: 'painless',
              },
            },
          },
        },
      },
    },
    track_total_hits: false,
  };
  const dataPrepperQuery: any = {
    size: 0,
    query: {
      bool: {
        must: [],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    aggs: {
      traces: {
        terms: {
          field: 'traceId',
          size: TRACES_MAX_NUM,
          order: {
            [field]: direction,
          },
          ...(isUnderOneHour && { execution_hint: 'map' }),
        },
        aggs: {
          latency: {
            max: {
              script: {
                source: `
                if (doc.containsKey('traceGroupFields.durationInNanos') && !doc['traceGroupFields.durationInNanos'].empty) {
                  return Math.round(doc['traceGroupFields.durationInNanos'].value / 10000) / 100.0
                }
                return 0
                `,
                lang: 'painless',
              },
            },
          },
          trace_group: {
            terms: {
              field: 'traceGroup',
              size: 1,
            },
          },
          error_count: {
            filter: {
              term: {
                'traceGroupFields.statusCode': '2',
              },
            },
          },
          last_updated: {
            max: {
              field: 'traceGroupFields.endTime',
            },
          },
        },
      },
    },
    track_total_hits: false,
  };
  if (traceId) {
    jaegerQuery.query.bool.filter.push({
      term: {
        traceID: traceId,
      },
    });
    dataPrepperQuery.query.bool.filter.push({
      term: {
        traceId,
      },
    });
  }
  return mode === 'jaeger' ? jaegerQuery : dataPrepperQuery;
};

export const getServiceBreakdownQuery = (traceId: string, mode: TraceAnalyticsMode) => {
  const jaegerQuery = {
    size: 0,
    query: {
      bool: {
        must: [
          {
            term: {
              traceID: traceId,
            },
          },
        ],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    aggs: {
      service_type: {
        terms: {
          field: 'process.serviceName',
          order: [
            {
              total_latency_nanos: 'desc',
            },
          ],
        },
        aggs: {
          total_latency_nanos: {
            sum: {
              field: 'duration',
            },
          },
          total_latency: {
            bucket_script: {
              buckets_path: {
                count: '_count',
                latency: 'total_latency_nanos.value',
              },
              script: 'Math.round(params.latency / 10) / 100.0',
            },
          },
        },
      },
    },
  };
  const dataPrepperQuery = {
    size: 0,
    query: {
      bool: {
        must: [
          {
            term: {
              traceId,
            },
          },
        ],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    aggs: {
      service_type: {
        terms: {
          field: 'serviceName',
          order: [
            {
              total_latency_nanos: 'desc',
            },
          ],
        },
        aggs: {
          total_latency_nanos: {
            sum: {
              field: 'durationInNanos',
            },
          },
          total_latency: {
            bucket_script: {
              buckets_path: {
                count: '_count',
                latency: 'total_latency_nanos.value',
              },
              script: 'Math.round(params.latency / 10000) / 100.0',
            },
          },
        },
      },
    },
  };
  return mode === 'jaeger' ? jaegerQuery : dataPrepperQuery;
};

export const getSpanDetailQuery = (mode: TraceAnalyticsMode, traceId: string, size = 3000) => {
  if (mode === 'jaeger') {
    return {
      size,
      query: {
        bool: {
          must: [
            {
              term: {
                traceID: traceId,
              },
            },
            {
              exists: {
                field: 'process.serviceName',
              },
            },
          ],
          filter: [],
          should: [],
          must_not: [],
        },
      },
      sort: [
        {
          startTime: {
            order: 'desc',
          },
        },
      ],
      _source: {
        includes: [
          'process.serviceName',
          'operationName',
          'startTime',
          'endTime',
          'spanID',
          'tag',
          'duration',
          'references',
        ],
      },
    };
  }
  return {
    size,
    query: {
      bool: {
        must: [
          {
            term: {
              traceId,
            },
          },
          {
            exists: {
              field: 'serviceName',
            },
          },
        ],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    sort: [
      {
        startTime: {
          order: 'desc',
        },
      },
    ],
    _source: {
      includes: [
        'serviceName',
        'name',
        'startTime',
        'endTime',
        'spanId',
        'status.code',
        'durationInNanos',
      ],
    },
  };
};

export const getPayloadQuery = (mode: TraceAnalyticsMode, traceId: string, size = 1000) => {
  if (mode === 'jaeger') {
    return {
      size,
      query: {
        bool: {
          must: [
            {
              term: {
                traceID: traceId,
              },
            },
          ],
          filter: [],
          should: [],
          must_not: [],
        },
      },
    };
  }
  return {
    size,
    query: {
      bool: {
        must: [
          {
            term: {
              traceId,
            },
          },
        ],
        filter: [],
        should: [],
        must_not: [],
      },
    },
  };
};

export const getSpanFlyoutQuery = (mode: TraceAnalyticsMode, spanId?: string, size = 1000) => {
  if (mode === 'jaeger') {
    return {
      size,
      query: {
        bool: {
          must: [
            {
              term: {
                spanID: spanId,
              },
            },
          ],
          filter: [],
          should: [],
          must_not: [],
        },
      },
    };
  }
  return {
    size,
    query: {
      bool: {
        must: [
          {
            term: {
              spanId,
            },
          },
        ],
        filter: [],
        should: [],
        must_not: [],
      },
    },
  };
};

export const getSpansQuery = (spanSearchParams: SpanSearchParams) => {
  const query: any = {
    size: spanSearchParams.size,
    from: spanSearchParams.from,
    query: {
      bool: {
        must: [],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    sort: spanSearchParams.sortingColumns,
  };
  return query;
};

export const getCustomIndicesTracesQuery = (
  mode: TraceAnalyticsMode,
  traceId: string = '',
  sort?: PropertySort,
  queryMode?: TraceQueryMode,
  isUnderOneHour?: boolean
) => {
  const jaegerQuery: any = {
    size: 0,
    query: {
      bool: {
        must: [],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    aggs: {
      traces: {
        terms: {
          field: 'traceID',
          size: TRACES_MAX_NUM,
          order: {
            [sort?.field || '_key']: sort?.direction || 'asc',
          },
          ...(isUnderOneHour && { execution_hint: 'map' }),
        },
        aggs: {
          latency: {
            max: {
              script: {
                source: `
                if (doc.containsKey('duration') && !doc['duration'].empty) {
                  return Math.round(doc['duration'].value) / 1000.0
                }

                return 0
                `,
                lang: 'painless',
              },
            },
          },
          trace_group: {
            terms: {
              field: 'traceGroup',
              size: 1,
            },
          },
          error_count: {
            filter: {
              term: {
                'tag.error': true,
              },
            },
          },
          last_updated: {
            max: {
              script: {
                source: `
                if (doc.containsKey('startTime') && !doc['startTime'].empty && doc.containsKey('duration') && !doc['duration'].empty) {
                  return (Math.round(doc['duration'].value) + Math.round(doc['startTime'].value)) / 1000.0
                }

                return 0
                `,
                lang: 'painless',
              },
            },
          },
        },
      },
    },
    track_total_hits: false,
  };

  const dataPrepperQuery: any = {
    size: TRACES_MAX_NUM,
    _source: {
      includes: [
        'spanId',
        'traceId',
        'parentSpanId',
        'traceGroup',
        'durationInNanos',
        'status.code',
        'endTime',
        '*attributes*',
        '*instrumentation*',
      ],
    },
    query: {
      bool: {
        must: [],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    ...(sort && { sort: [{ [sort.field]: { order: sort.direction } }] }),
    track_total_hits: false,
  };

  if (queryMode === 'root_spans') {
    dataPrepperQuery.query.bool.filter.push({
      term: {
        parentSpanId: '', // Data prepper root span doesn't have any parent.
      },
    });
  } else if (queryMode === 'entry_spans') {
    dataPrepperQuery.query.bool.filter.push({
      term: {
        kind: 'SPAN_KIND_SERVER',
      },
    });
  }
  if (traceId) {
    jaegerQuery.query.bool.filter.push({
      term: {
        traceID: traceId,
      },
    });
    dataPrepperQuery.query.bool.filter.push({
      term: {
        traceId,
      },
    });
  }
  return mode === 'jaeger' ? jaegerQuery : dataPrepperQuery;
};
