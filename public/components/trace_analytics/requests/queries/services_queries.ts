/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { TraceSettings, getServiceIndices } from '../../components/common/helper_functions';
import { ServiceObject } from '../../components/common/plots/service_map';

export const getServicesQuery = (
  mode: TraceAnalyticsMode,
  serviceName: string | undefined,
  DSL?: any
) => {
  const query = {
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
      service: {
        terms: {
          field: mode === 'jaeger' ? 'process.serviceName' : 'serviceName',
          size: 10000,
        },
        aggs: {
          trace_count: {
            cardinality: {
              field: mode === 'jaeger' ? 'traceID' : 'traceId',
            },
          },
        },
      },
    },
  };
  if (mode === 'jaeger') {
    if (serviceName) {
      query.query.bool.filter.push({
        term: {
          'process.serviceName': serviceName,
        },
      });
    }
    DSL?.custom?.serviceNames?.map((service: string) => {
      query.query.bool.filter.push({
        term: {
          'process.serviceName': service,
        },
      });
    });
    DSL?.custom?.serviceNamesExclude?.map((service: string) => {
      query.query.bool.must_not.push({
        term: {
          'process.serviceName': service,
        },
      });
    });
  } else {
    if (serviceName) {
      query.query.bool.filter.push({
        term: {
          serviceName,
        },
      });
    }
    DSL?.custom?.serviceNames?.map((service: string) => {
      query.query.bool.filter.push({
        term: {
          serviceName: service,
        },
      });
    });
    DSL?.custom?.serviceNamesExclude?.map((service: string) => {
      query.query.bool.must_not.push({
        term: {
          serviceName: service,
        },
      });
    });
  }
  return query;
};

export const getServiceMapQuery = (mode: TraceAnalyticsMode) => {
  const serviceMapMaxNodes = TraceSettings.getServiceMapMaxNodes();
  const serviceMapMaxEdges = TraceSettings.getServiceMapMaxEdges();

  return {
    index: getServiceIndices(mode),
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
      service_name: {
        terms: {
          field: 'serviceName',
          size: serviceMapMaxNodes,
        },
        aggs: {
          target_resource: {
            terms: {
              field: 'target.resource',
              size: serviceMapMaxEdges,
            },
          },
          target_edges: {
            terms: {
              field: 'target.resource',
              size: serviceMapMaxEdges,
            },
            aggs: {
              service: {
                terms: {
                  field: 'target.serviceName',
                  size: serviceMapMaxEdges,
                },
              },
              domain: {
                terms: {
                  field: 'target.domain',
                  size: serviceMapMaxEdges,
                },
              },
            },
          },
          destination_edges: {
            terms: {
              field: 'destination.resource',
              size: serviceMapMaxEdges,
            },
            aggs: {
              service: {
                terms: {
                  field: 'destination.serviceName',
                  size: serviceMapMaxEdges,
                },
              },
              domain: {
                terms: {
                  field: 'destination.domain',
                  size: serviceMapMaxEdges,
                },
              },
            },
          },
        },
      },
    },
  };
};

export const getServiceValidQuery = (mode: TraceAnalyticsMode, serviceName: string) => {
  return {
    index: getServiceIndices(mode),
    size: 0,
    query: {
      bool: {
        must: [
          {
            term: {
              serviceName: {
                value: serviceName,
              },
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

export const getServiceMetricsQuery = (
  DSL: any,
  serviceNames: string[],
  map: ServiceObject,
  mode: TraceAnalyticsMode
) => {
  const serviceMapMaxNodes = TraceSettings.getServiceMapMaxNodes();

  const targetResource = [].concat(
    ...Object.keys(map).map((service) => map[service].targetResources)
  );
  const jaegerQuery: any = {
    size: 0,
    query: {
      bool: {
        must: [],
        should: [],
        must_not: [],
        filter: [
          {
            terms: {
              'process.serviceName': serviceNames,
            },
          },
          {
            bool: {
              should: [
                {
                  bool: {
                    filter: [
                      {
                        bool: {
                          must_not: {
                            term: {
                              references: {
                                value: [],
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
                {
                  bool: {
                    must: {
                      term: {
                        references: {
                          value: [],
                        },
                      },
                    },
                  },
                },
              ],
              adjust_pure_negative: true,
              boost: 1,
            },
          },
        ],
      },
    },
    aggregations: {
      service_name: {
        terms: {
          field: 'process.serviceName',
          size: serviceMapMaxNodes,
          min_doc_count: 1,
          shard_min_doc_count: 0,
          show_term_doc_count_error: false,
          order: [
            {
              _count: 'desc',
            },
            {
              _key: 'asc',
            },
          ],
        },
        aggregations: {
          average_latency_nanos: {
            avg: {
              field: 'duration',
            },
          },
          average_latency: {
            bucket_script: {
              buckets_path: {
                count: '_count',
                latency: 'average_latency_nanos.value',
              },
              script: 'Math.round(params.latency / 10) / 100.0',
            },
          },
          error_count: {
            filter: {
              term: {
                'tag.error': true,
              },
            },
          },
          error_rate: {
            bucket_script: {
              buckets_path: {
                total: '_count',
                errors: 'error_count._count',
              },
              script: 'params.errors / params.total * 100',
            },
          },
        },
      },
    },
  };

  const dataPrepperQuery: any = {
    size: 0,
    query: {
      bool: {
        must: [],
        should: [],
        must_not: [],
        filter: [
          {
            terms: {
              serviceName: serviceNames,
            },
          },
          {
            bool: {
              should: [
                {
                  bool: {
                    filter: [
                      {
                        bool: {
                          must_not: {
                            term: {
                              parentSpanId: {
                                value: '',
                              },
                            },
                          },
                        },
                      },
                      {
                        terms: {
                          name: targetResource,
                        },
                      },
                    ],
                  },
                },
                {
                  bool: {
                    must: {
                      term: {
                        parentSpanId: {
                          value: '',
                        },
                      },
                    },
                  },
                },
              ],
              adjust_pure_negative: true,
              boost: 1,
            },
          },
        ],
      },
    },
    aggregations: {
      service_name: {
        terms: {
          field: 'serviceName',
          size: serviceMapMaxNodes,
          min_doc_count: 1,
          shard_min_doc_count: 0,
          show_term_doc_count_error: false,
          order: [
            {
              _count: 'desc',
            },
            {
              _key: 'asc',
            },
          ],
        },
        aggregations: {
          average_latency_nanos: {
            avg: {
              field: 'durationInNanos',
            },
          },
          average_latency: {
            bucket_script: {
              buckets_path: {
                count: '_count',
                latency: 'average_latency_nanos.value',
              },
              script: 'Math.round(params.latency / 10000) / 100.0',
            },
          },
          error_count: {
            filter: {
              term: {
                'status.code': '2',
              },
            },
          },
          error_rate: {
            bucket_script: {
              buckets_path: {
                total: '_count',
                errors: 'error_count._count',
              },
              script: 'params.errors / params.total * 100',
            },
          },
        },
      },
    },
  };
  if (DSL.custom?.timeFilter.length > 0) {
    jaegerQuery.query.bool.filter.push(...DSL.custom.timeFilter);
    dataPrepperQuery.query.bool.filter.push(...DSL.custom.timeFilter);
  }
  return mode === 'jaeger' ? jaegerQuery : dataPrepperQuery;
};

export const getServiceTrendsQuery = (_mode: TraceAnalyticsMode, serviceFilter: any) => {
  const query = {
    size: 0,
    query: {
      bool: {
        must: [
          {
            range: {
              startTime: {
                gte: 'now-24h',
                lte: 'now',
              },
            },
          },
          ...serviceFilter,
        ],
        filter: [],
        should: [],
        must_not: [],
      },
    },
    aggs: {
      service_trends: {
        terms: {
          field: 'serviceName',
          size: 10000,
        },
        aggs: {
          time_buckets: {
            date_histogram: {
              field: 'startTime',
              fixed_interval: '1h',
            },
            aggs: {
              trace_count: {
                cardinality: {
                  field: 'traceId',
                },
              },
              error_count: {
                filter: {
                  term: {
                    'status.code': '2',
                  },
                },
                aggs: {
                  trace_count: {
                    cardinality: {
                      field: 'traceId',
                    },
                  },
                },
              },
              error_rate: {
                bucket_script: {
                  buckets_path: {
                    total: 'trace_count',
                    errors: 'error_count>trace_count',
                  },
                  script: 'params.errors / params.total * 100',
                },
              },
              average_latency: {
                scripted_metric: {
                  init_script: 'state.traceIdToLatencyMap = [:];',
                  map_script:
                    "\n                    if (doc.containsKey('traceGroupFields.durationInNanos') && !doc['traceGroupFields.durationInNanos'].empty) {\n                      def traceId = doc['traceId'].value;\n                      if (!state.traceIdToLatencyMap.containsKey(traceId)) {\n                        state.traceIdToLatencyMap[traceId] = doc['traceGroupFields.durationInNanos'].value;\n                      }\n                    }\n                  ",
                  combine_script: 'return state.traceIdToLatencyMap',
                  reduce_script:
                    '\n                    def seenTraceIdsMap = [:];\n                    def totalLatency = 0.0;\n                    def traceCount = 0.0;\n\n                    for (s in states) {\n                      if (s == null) {\n                        continue;\n                      }\n\n                      for (entry in s.entrySet()) {\n                        def traceId = entry.getKey();\n                        def traceLatency = entry.getValue();\n                        if (!seenTraceIdsMap.containsKey(traceId)) {\n                          seenTraceIdsMap[traceId] = true;\n                          totalLatency += traceLatency;\n                          traceCount++;\n                        }\n                      }\n                    }\n\n                    def average_latency_nanos = totalLatency / traceCount;\n                    return Math.round(average_latency_nanos / 10000) / 100.0;\n                  ',
                },
              },
            },
          },
        },
      },
    },
  };

  return query;
};
