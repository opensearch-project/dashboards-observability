/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import isEmpty from 'lodash/isEmpty';
import { useRef, useState } from 'react';
import { batch, useDispatch, useSelector } from 'react-redux';
import {
  AVAILABLE_FIELDS,
  FINAL_QUERY,
  QUERIED_FIELDS,
  SELECTED_FIELDS,
  UNSELECTED_FIELDS,
} from '../../../../common/constants/explorer';
import { PPL_STATS_REGEX } from '../../../../common/constants/shared';
import PPLService from '../../../services/requests/ppl';
import { selectFields, sortFields, updateFields } from '../redux/slices/field_slice';
import { reset as patternsReset } from '../redux/slices/patterns_slice';
import { setResponseForSummaryStatus } from '../redux/slices/query_assistant_summarization_slice';
import {
  fetchFailure,
  fetchSuccess,
  reset as queryResultReset,
} from '../redux/slices/query_result_slice';
import { selectQueries } from '../redux/slices/query_slice';
import { reset as visualizationReset } from '../redux/slices/visualization_slice';

interface IFetchEventsParams {
  pplService: PPLService;
  requestParams: { tabId: string };
}

export const useFetchEvents = ({ pplService, requestParams }: IFetchEventsParams) => {
  const dispatch = useDispatch();
  const [isEventsLoading, setIsEventsLoading] = useState(false);
  const queries = useSelector(selectQueries);
  const fields = useSelector(selectFields);
  const [response, setResponse] = useState();
  const queriesRef = useRef();
  const fieldsRef = useRef();
  const responseRef = useRef();
  queriesRef.current = queries;
  fieldsRef.current = fields;
  responseRef.current = response;

  const fetchEvents = (
    { query }: { query: string },
    format: string,
    handler: (res: any) => unknown,
    errorHandler?: (error: any) => void
  ) => {
    setIsEventsLoading(true);
    return pplService
      .fetch({ query, format }, undefined, errorHandler)
      .then((res: any) => handler(res))
      .catch((err: any) => {
        console.error(err);
        throw err;
      })
      .finally(() => setIsEventsLoading(false));
  };

  const addSchemaRowMapping = (queryResult) => {
    const pplRes = queryResult;

    const data: any[] = [];

    _.forEach(pplRes.datarows, (row) => {
      const record: any = {};

      for (let i = 0; i < pplRes.schema.length; i++) {
        const cur = pplRes.schema[i];

        if (typeof row[i] === 'object') {
          record[cur.name] = JSON.stringify(row[i]);
        } else if (typeof row[i] === 'boolean') {
          record[cur.name] = row[i].toString();
        } else {
          record[cur.name] = row[i];
        }
      }

      data.push(record);
    });
    return {
      ...queryResult,
      jsonData: data,
    };
  };

  const dispatchOnGettingHis = (res: any, query: string) => {
    const processedRes = addSchemaRowMapping(res);
    setResponse(processedRes);
    batch(() => {
      dispatch(
        queryResultReset({
          tabId: requestParams.tabId,
        })
      );
      dispatch(
        fetchSuccess({
          tabId: requestParams.tabId,
          data: {
            ...processedRes,
          },
        })
      );
      dispatch(
        updateFields({
          tabId: requestParams.tabId,
          data: {
            [UNSELECTED_FIELDS]: processedRes?.schema ? [...processedRes.schema] : [],
            [QUERIED_FIELDS]: query.match(PPL_STATS_REGEX) ? [...processedRes.schema] : [], // when query contains stats, need populate this
            [AVAILABLE_FIELDS]: processedRes?.schema ? [...processedRes.schema] : [],
            [SELECTED_FIELDS]: [],
          },
        })
      );
      dispatch(
        sortFields({
          tabId: requestParams.tabId,
          data: [AVAILABLE_FIELDS, UNSELECTED_FIELDS],
        })
      );
      dispatch(
        visualizationReset({
          tabId: requestParams.tabId,
        })
      );
    });
  };

  const dispatchOnNoHis = (res: any) => {
    setResponse(res);
    batch(() => {
      dispatch(
        queryResultReset({
          tabId: requestParams.tabId,
        })
      );
      dispatch(
        updateFields({
          tabId: requestParams.tabId,
          data: {
            [SELECTED_FIELDS]: [],
            [UNSELECTED_FIELDS]: [],
            [QUERIED_FIELDS]: [],
            [AVAILABLE_FIELDS]: res?.schema ? [...res.schema] : [],
          },
        })
      );
      dispatch(
        sortFields({
          tabId: requestParams.tabId,
          data: [AVAILABLE_FIELDS],
        })
      );
      dispatch(
        visualizationReset({
          tabId: requestParams.tabId,
        })
      );
      dispatch(
        patternsReset({
          tabId: requestParams.tabId,
        })
      );
    });
  };

  const getLiveTail = (query: string = '', errorHandler?: (error: any) => void) => {
    const cur = queriesRef.current;
    const searchQuery = isEmpty(query) ? cur![requestParams.tabId][FINAL_QUERY] : query;
    fetchEvents(
      { query: searchQuery },
      'jdbc',
      (res: any) => {
        if (!isEmpty(res.jsonData)) {
          if (!isEmpty(responseRef.current)) {
            res.jsonData = res.jsonData.concat(responseRef.current.jsonData);
            res.datarows = res.datarows.concat(responseRef.current.datarows);
            res.total = res.total + responseRef.current.total;
            res.size = res.size + responseRef.current.size;
          }
          dispatchOnGettingHis(res, searchQuery);
        }
        if (isEmpty(res.jsonData) && isEmpty(responseRef.current)) {
          dispatchOnNoHis(res);
        }
      },
      errorHandler
    );
  };

  const getEvents = async (
    query: string = '',
    errorHandler?: (error: any) => void,
    setSummaryStatus?: boolean
  ) => {
    if (isEmpty(query)) return;
    const cur = queriesRef.current;
    const searchQuery = isEmpty(query) ? cur![requestParams.tabId][FINAL_QUERY] : query;
    await fetchEvents(
      { query: searchQuery },
      'jdbc',
      async (res: any) => {
        if (!isEmpty(res.jsonData)) {
          await dispatchOnGettingHis(res, searchQuery);
        } else if (!isEmpty(res.data?.resp)) {
          await dispatchOnGettingHis(JSON.parse(res.data?.resp), searchQuery);
        } else {
          // when no hits and needs to get available fields to override default timestamp
          dispatchOnNoHis(res);
        }
        if (setSummaryStatus)
          dispatch(
            setResponseForSummaryStatus({
              tabId: requestParams.tabId,
              responseForSummaryStatus: 'success',
            })
          );
      },
      (error) => {
        errorHandler?.(error);
        batch(() => {
          dispatch(
            queryResultReset({
              tabId: requestParams.tabId,
            })
          );
          dispatch(
            fetchFailure({
              tabId: requestParams.tabId,
              error,
            })
          );
          if (setSummaryStatus)
            dispatch(
              setResponseForSummaryStatus({
                tabId: requestParams.tabId,
                responseForSummaryStatus: 'failure',
              })
            );
        });
      }
    );
  };

  const getAvailableFields = (query: string) => {
    fetchEvents({ query }, 'jdbc', (res: any) => {
      batch(() => {
        dispatch(
          updateFields({
            tabId: requestParams.tabId,
            data: {
              [AVAILABLE_FIELDS]: res?.schema ? [...res.schema] : [],
            },
          })
        );
        dispatch(
          sortFields({
            tabId: requestParams.tabId,
            data: [AVAILABLE_FIELDS, UNSELECTED_FIELDS],
          })
        );
      });
    });
  };

  return {
    isEventsLoading,
    getLiveTail,
    getEvents,
    getAvailableFields,
    fetchEvents,
    dispatchOnGettingHis,
  };
};
