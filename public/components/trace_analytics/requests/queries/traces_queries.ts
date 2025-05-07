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
  maxTraces: number = TRACES_MAX_NUM,
  sort?: PropertySort,
  isUnderOneHour?: boolean
) => {
  const field = sort?.field || '_key';
  const direction = sort?.direction || 'asc';
  // Need aggregation because filtering considers the children
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
          size: maxTraces,
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
      unique_traces: {
        cardinality: {
          field: 'traceId',
        },
      },
      traces: {
        terms: {
          field: 'traceId',
          size: maxTraces,
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
              script: {
                source: `
                  if (doc.containsKey('traceGroupFields.endTime') && !doc['traceGroupFields.endTime'].empty) {
                    return doc['traceGroupFields.endTime'].value;
                  }
                  if (doc.containsKey('endTime') && !doc['endTime'].empty) {
                    return doc['endTime'].value;
                  }
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

export const getPayloadQuery = (mode: TraceAnalyticsMode, traceId: string, size = 3000) => {
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
  pageIndex: number = 0,
  pageSize: number = 10,
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
    size: pageSize,
    from: pageIndex * pageSize,
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
    track_total_hits: true,
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
