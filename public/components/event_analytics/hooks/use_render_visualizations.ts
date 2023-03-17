/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { batch, useDispatch } from 'react-redux';
import { VisualizationState } from 'common/types/explorer';
import { updateFields, sortFields } from '../redux/slices/field_slice';
import { fetchSuccess } from '../redux/slices/query_result_slice';
import { QUERIED_FIELDS, SELECTED_FIELDS } from '../../../../common/constants/explorer';
import { change as changeVizConfig } from '../redux/slices/viualization_config_slice';
import { changeQuery } from '../redux/slices/query_slice';

export interface IVisFetchParams {
  query: string;
  successCallback: (res: any) => any;
  errorCallback: (err: any) => any;
}

export const useRenderVisualization = ({ pplService, requestParams }) => {
  const dispatch = useDispatch();
  const fetchVisualizations = async (
    { query }: { query: string },
    format: string,
    successHandler: (res: any) => void,
    errorHandler: (error: any) => void
  ) => {
    await pplService
      .fetch({ query, format }, (error) => {
        errorHandler(error);
      })
      .then((res: any) => {
        successHandler(res);
      });
  };

  const getVisualizations = ({ query, successCallback, errorCallback }: IVisFetchParams) => {
    fetchVisualizations(
      { query },
      'jdbc',
      (res: any) => {
        successCallback(res);
      },
      (error: any) => {
        errorCallback(error);
      }
    );
  };

  const fillVisDataInStore = ({
    visData,
    queryState,
    visConfMetadata,
    visMeta,
  }: VisualizationState) => {
    batch(() => {
      // query
      dispatch(
        changeQuery({
          tabId: requestParams.tabId,
          query: queryState,
        })
      );

      // queryResults
      dispatch(
        fetchSuccess({
          tabId: requestParams.tabId,
          data: {
            ...visData,
          },
        })
      );

      // fields
      dispatch(
        updateFields({
          tabId: requestParams.tabId,
          data: {
            [QUERIED_FIELDS]: visData?.metadata?.fields || [],
            [SELECTED_FIELDS]: [],
          },
        })
      );

      // sort fields
      dispatch(
        sortFields({
          tabId: requestParams.tabId,
          data: [QUERIED_FIELDS],
        })
      );

      // explorerVisualizationConfig
      dispatch(
        changeVizConfig({
          tabId: requestParams.tabId,
          vizId: visMeta.visId,
          data: {
            dataConfig: {
              ...visConfMetadata,
            },
          },
        })
      );
    });
  };

  return {
    getVisualizations,
    fillVisDataInStore,
  };
};
