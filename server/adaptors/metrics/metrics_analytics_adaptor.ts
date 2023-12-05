/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ILegacyScopedClusterClient } from '../../../../../src/core/server';

export class MetricsAnalyticsAdaptor {
  fetch = async function (client: ILegacyScopedClusterClient, query: any, index: string) {
    try {
      const response = await client.callAsCurrentUser('search', {
        body: query,
        index,
      });
      return response;
    } catch (error) {
      throw new Error('Index Panel Error:' + error);
    }
  };

  queryToFetchBinCount = async (
    client: ILegacyScopedClusterClient,
    min: string,
    max: string,
    startTime: string,
    endTime: string,
    documentName: string,
    index: string
  ) => {
    console.log('min in adaptor: ', min);
    console.log('min in adaptor type: ', typeof min);
    console.log('max in adaptor: ', max);
    console.log('max in adaptor type: ', typeof max);
    const metricsQuery = {
      size: 0,
      query: {
        bool: {
          must: [
            {
              term: {
                'name.keyword': {
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
      const response = await this.fetch(client, metricsQuery, index);
      return response.aggregations;
    } catch (error) {
      throw new Error('Fetch Bin count Error:' + error);
    }
  };

  queryToFetchSampleDocument = async (
    client: ILegacyScopedClusterClient,
    documentName: string,
    index: string
  ) => {
    const metricsQuery = {
      size: 1,
      query: {
        bool: {
          must: [
            {
              term: {
                'name.keyword': {
                  value: documentName,
                },
              },
            },
          ],
        },
      },
    };

    try {
      const response = await this.fetch(client, metricsQuery, index);
      return response;
    } catch (error) {
      throw new Error('Fetch Bin count Error:' + error);
    }
  };
}
