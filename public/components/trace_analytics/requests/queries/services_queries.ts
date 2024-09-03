/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SERVICE_MAP_MAX_EDGES,
  SERVICE_MAP_MAX_NODES,
} from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import {
  getServiceIndices,
  getServiceMapTargetResources,
} from '../../components/common/helper_functions';
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

export const getRelatedServicesQuery = (serviceName: string) => {
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
      traces: {
        terms: {
          field: 'traceId',
          size: 10000,
        },
        aggs: {
          all_services: {
            terms: {
              field: 'serviceName',
              size: 10000,
            },
          },
          service: {
            filter: {
              bool: {
                must: [
                  {
                    term: {
                      serviceName,
                    },
                  },
                ],
                must_not: [],
              },
            },
          },
        },
      },
    },
  };
  return query;
};

export const getServiceNodesQuery = (mode: TraceAnalyticsMode) => {
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
          size: SERVICE_MAP_MAX_NODES,
        },
        aggs: {
          trace_group: {
            terms: {
              field: 'traceGroupName',
              size: SERVICE_MAP_MAX_EDGES,
            },
            aggs: {
              target_resource: {
                terms: {
                  field: 'target.resource',
                  size: SERVICE_MAP_MAX_EDGES,
                },
              },
            },
          },
        },
      },
    },
  };
};

export const getServiceEdgesQuery = (
  source: 'destination' | 'target',
  mode: TraceAnalyticsMode
) => {
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
          size: SERVICE_MAP_MAX_EDGES,
        },
        aggs: {
          resource: {
            terms: {
              field: `${source}.resource`,
              size: SERVICE_MAP_MAX_EDGES,
            },
            aggs: {
              domain: {
                terms: {
                  field: `${source}.domain`,
                  size: SERVICE_MAP_MAX_EDGES,
                },
              },
            },
          },
        },
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
  const traceGroupFilter = new Set(
    DSL?.query?.bool.must
      .filter((must: any) => must.term?.['traceGroup'])
      .map((must: any) => must.term.traceGroup) || []
  );

  const targetResource =
    traceGroupFilter.size > 0
      ? [].concat(
          ...[].concat(
            ...serviceNames.map((service) =>
              map[service].traceGroups
                .filter((traceGroup) => traceGroupFilter.has(traceGroup.traceGroup))
                .map((traceGroup) => traceGroup.targetResource)
            )
          )
        )
      : [].concat(...Object.keys(map).map((service) => getServiceMapTargetResources(map, service)));
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
          size: SERVICE_MAP_MAX_NODES,
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
          size: SERVICE_MAP_MAX_NODES,
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
