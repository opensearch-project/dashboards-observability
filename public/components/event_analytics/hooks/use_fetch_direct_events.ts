/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef } from 'react';
import { batch } from 'react-redux';
import isEmpty from 'lodash/isEmpty';
import { useDispatch, useSelector } from 'react-redux';
import { IField } from 'common/types/explorer';
import {
  FINAL_QUERY,
  SELECTED_FIELDS,
  UNSELECTED_FIELDS,
  AVAILABLE_FIELDS,
  QUERIED_FIELDS,
} from '../../../../common/constants/explorer';
import { fetchSuccess, reset as queryResultReset } from '../redux/slices/query_result_slice';
import { reset as patternsReset } from '../redux/slices/patterns_slice';
import { selectQueries } from '../redux/slices/query_slice';
import { reset as visualizationReset } from '../redux/slices/visualization_slice';
import { updateFields, sortFields, selectFields } from '../redux/slices/field_slice';
import PPLService from '../../../services/requests/ppl';
import { PPL_STATS_REGEX } from '../../../../common/constants/shared';

interface IFetchEventsParams {
  pplService: PPLService;
  requestParams: { tabId: string };
}

export const useFetchDirectEvents = ({ pplService, requestParams }: IFetchEventsParams) => {
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
      .fetch({ query, format }, errorHandler)
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
    const selectedFields: string[] = fieldsRef.current![requestParams.tabId][SELECTED_FIELDS].map(
      (field: IField) => field.name
    );
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

  const getEvents = (query: string = '', errorHandler?: (error: any) => void) => {
    if (isEmpty(query)) return;
    return dispatchOnGettingHis(res, '');
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
  };
};
