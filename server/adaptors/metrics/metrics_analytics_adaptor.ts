/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ILegacyScopedClusterClient } from '../../../../../src/core/server';

export class MetricsAnalyticsAdaptor {
  fetch = async function (client, query: any, index: string, dataSourceMDSId?: string) {
    try {
      let response;
      if (dataSourceMDSId) {
        response = await client.callAPI('search', {
          body: query,
          index,
        });
      }
      response = await client.callAsCurrentUser('search', {
        body: query,
        index,
      });
      return response;
    } catch (error) {
      throw new Error('Fetch Otel Metrics Error:' + error);
    }
  };

  queryToFetchBinCount = async (
    client: ILegacyScopedClusterClient,
    min: string,
    max: string,
    startTime: string,
    endTime: string,
    documentName: string,
    index: string,
    dataSourceMDSId?: string
  ) => {
    const metricsQuery = {
      size: 0,
      query: {
        bool: {
          must: [
            {
              term: {
                name: {
                  value: documentName,
                },
              },
            },
            {
              range: {
                time: {
                  gte: startTime,
                  lte: endTime,
                },
              },
            },
          ],
        },
      },
      aggs: {
        nested_buckets: {
          nested: {
            path: 'buckets',
          },
          aggs: {
            bucket_range: {
              filter: {
                range: {
                  'buckets.max': {
                    gt: min,
                    lte: max,
                  },
                },
              },
              aggs: {
                bucket_count: {
                  sum: {
                    field: 'buckets.count',
                  },
                },
              },
            },
          },
        },
      },
    };

    try {
      const response = await this.fetch(client, metricsQuery, index, dataSourceMDSId);
      return response.aggregations;
    } catch (error) {
      throw new Error('Fetch Bin count Error:' + error);
    }
  };

  queryToFetchSampleDocument = async (
    client: ILegacyScopedClusterClient,
    documentName: string,
    index: string,
    dataSourceMDSId?: string
  ) => {
    const metricsQuery = {
      size: 1,
      query: {
        bool: {
          must: [
            {
              term: {
                name: {
                  value: documentName,
                },
              },
            },
          ],
        },
      },
    };

    try {
      const response = await this.fetch(client, metricsQuery, index, dataSourceMDSId);
      return response;
    } catch (error) {
      throw new Error('Fetch Sample Document Error:' + error);
    }
  };
  queryToFetchDocumentNames = async (client, index: string, dataSourceMDSId?: string) => {
    const metricsQuery = {
      size: 0,
      query: {
        bool: {
          filter: [
            {
              term: {
                kind: 'HISTOGRAM',
              },
            },
          ],
        },
      },
      aggs: {
        distinct_names: {
          terms: {
            field: 'name',
            size: 500,
          },
        },
      },
    };

    try {
      const response = await this.fetch(client, metricsQuery, index, dataSourceMDSId);
      return response;
    } catch (error) {
      throw new Error('Fetch Document Names Error:' + error);
    }
  };
}
