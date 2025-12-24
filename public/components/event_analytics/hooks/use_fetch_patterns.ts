/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IField, PatternTableData } from 'common/types/explorer';
import isUndefined from 'lodash/isUndefined';
import PPLService from 'public/services/requests/ppl';
import MLCommonsRCFService from 'public/services/requests/ml_commons_rcf';
import { useRef } from 'react';
import { batch, useDispatch, useSelector } from 'react-redux';
import {
  FINAL_QUERY,
  PATTERNS_REGEX,
  PATTERN_REGEX,
  SELECTED_PATTERN_FIELD,
  SELECTED_TIMESTAMP,
} from '../../../../common/constants/explorer';
import { buildPatternsQuery } from '../../common/query_utils';
import { IPPLEventsDataSource } from '../../../../server/common/types';
import { reset as resetPatterns, setPatterns } from '../redux/slices/patterns_slice';
import { changeQuery, selectQueries } from '../redux/slices/query_slice';
import { useFetchEvents } from './use_fetch_events';

interface IFetchPatternsParams {
  pplService: PPLService;
  mlCommonsRCFService: MLCommonsRCFService;
  requestParams: { tabId: string };
}

export const useFetchPatterns = ({ pplService, mlCommonsRCFService, requestParams }: IFetchPatternsParams) => {
  const dispatch = useDispatch();
  const { isEventsLoading, fetchEvents } = useFetchEvents({
    pplService,
    requestParams,
  });
  const queries = useSelector(selectQueries);
  const queriesRef = useRef<any>();
  queriesRef.current = queries;

  const dispatchOnPatterns = (res: { patternTableData: PatternTableData[] }) => {
    batch(() => {
      dispatch(
        resetPatterns({
          tabId: requestParams.tabId,
        })
      );
      dispatch(
        setPatterns({
          tabId: requestParams.tabId,
          data: {
            ...res,
          },
        })
      );
    });
  };

  const buildPatternDataQuery = (query: string, patternField: string, patternRegex: string) => {
    let statsQuery = buildPatternsQuery(query, patternField, patternRegex);
    statsQuery += ` | stats count(), take(\`${patternField}\`, 1) by patterns_field`;
    return statsQuery;
  };

  const buildPatternTimeSeriesQuery = (
    query: string,
    patternField: string,
    patternRegex: string,
    timestampField: string,
    interval: string
  ) => {
    let timeSeriesQuery = buildPatternsQuery(query, patternField, patternRegex);
    timeSeriesQuery +=
      ` | stats count() by span(\`${timestampField}\`, 1${interval || 'm'}) as timestamp, patterns_field`;
    return timeSeriesQuery;
  };

  const clearPatternCommands = (query: string) => query.replace(PATTERNS_REGEX, '');

  const getPatterns = (interval: string, errorHandler?: (error: any) => void, query?: string) => {
    const cur = queriesRef.current;
    if (!cur) return;

    const rawQuery = cur[requestParams.tabId][FINAL_QUERY];
    const searchQuery = isUndefined(query) ? clearPatternCommands(rawQuery) : query;
    const patternField = cur[requestParams.tabId][SELECTED_PATTERN_FIELD];
    const timestampField = cur[requestParams.tabId][SELECTED_TIMESTAMP];
    const patternRegex = cur[requestParams.tabId][PATTERN_REGEX];
    const statsQuery = buildPatternDataQuery(searchQuery, patternField, patternRegex);
    const timeSeriesQuery = buildPatternTimeSeriesQuery(
      searchQuery,
      patternField,
      patternRegex,
      timestampField,
      interval
    );
    
    // Fetch patterns data for the current query results
    Promise.allSettled([
      fetchEvents({ query: statsQuery }, 'jdbc', (res) => res),
      fetchEvents({ query: timeSeriesQuery }, 'jdbc', (res) => res),
    ])
      .then(async (res) => {
        const [statsResp, timeSeriesResp] = res as Array<PromiseSettledResult<IPPLEventsDataSource>>;
        if (statsResp.status === 'rejected') {
          throw statsResp.reason;
        }

        let anomaliesResultsAvailable = true;
        const anomaliesMap: { [x: string]: number } = {};
        
        // Phase 2: Perform anomaly detection if time series data is available
        if (timeSeriesResp.status === 'fulfilled') {
          try {
            // Transform PPL results to ML Commons format
            const timeSeriesData = timeSeriesResp.value.datarows.map((row) => ({
              timestamp: row[0],
              category: row[1],
              value: row[2] || 0,
            }));

            // Skip anomaly detection if no time series data
            if (timeSeriesData.length === 0) {
              console.warn('No time series data available for anomaly detection');
              anomaliesResultsAvailable = false;
            } else {
              // Call ML Commons RCF API
              const rcfResponse = await mlCommonsRCFService.predictAnomalies({
                data: timeSeriesData,
                parameters: {
                  number_of_trees: 100,
                  shingle_size: 8,
                  sample_size: 256,
                  output_after: 32,
                  time_decay: 0.0001,
                  anomaly_rate: 0.005,
                  time_field: 'timestamp',
                  category_field: 'category',
                },
              });

              // Process anomaly detection results
              if (rcfResponse.anomalies && rcfResponse.anomalies.length > 0) {
                rcfResponse.anomalies.forEach((anomaly: any) => {
                  if (anomaly.isAnomaly) {
                    const category = anomaly.category;
                    anomaliesMap[category] = (anomaliesMap[category] || 0) + 1;
                  }
                });
              }
            }
          } catch (rcfError) {
            console.error('Error in ML Commons RCF anomaly detection:', rcfError);
            anomaliesResultsAvailable = false;
            // Continue without anomaly detection results
            // This maintains the same behavior as the original implementation
          }
        } else {
          console.error('Error fetching time series data for anomaly detection:', timeSeriesResp.reason);
          anomaliesResultsAvailable = false;
        }

        const formatToTableData: PatternTableData[] = statsResp.value.datarows.map((row) => ({
          count: row[0],
          pattern: row[2],
          sampleLog: row[1][0],
          anomalyCount: anomaliesResultsAvailable ? anomaliesMap[row[2]] || 0 : undefined,
        }));
        dispatchOnPatterns({ patternTableData: formatToTableData });
      })
      .catch(() => {
        dispatch(
          resetPatterns({
            tabId: requestParams.tabId,
          })
        );
      });
  };

  const setDefaultPatternsField = async (
    index: string,
    patternField: string,
    errorHandler?: (error: any) => void
  ) => {
    if (!patternField && index) {
      const query = `source = ${index} | head 1`;
      await fetchEvents(
        { query },
        'jdbc',
        async (res: any) => {
          // Create array of only string type fields
          const textFields = res.schema.filter((field: IField) => field.type === 'string');
          // Loop through array and find field with longest value
          let defaultPatternField = '';
          let maxLength = 0;
          textFields.forEach((field: IField) => {
            const curLength = res.jsonData[0][field.name].length;
            if (curLength > maxLength) {
              maxLength = curLength;
              defaultPatternField = field.name;
            }
          });
          patternField = defaultPatternField;
        },
        errorHandler
      );
    }
    // Set pattern to the pattern passed in or the default pattern field found if pattern is empty
    dispatch(
      changeQuery({
        tabId: requestParams.tabId,
        query: {
          [SELECTED_PATTERN_FIELD]: patternField,
        },
      })
    );
  };

  return {
    isEventsLoading,
    getPatterns,
    setDefaultPatternsField,
  };
};
