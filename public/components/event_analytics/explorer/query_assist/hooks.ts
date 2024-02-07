/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBoxOptionOption } from '@elastic/eui';
import { CatIndicesResponse } from '@opensearch-project/opensearch/api/types';
import { Reducer, useEffect, useReducer, useState } from 'react';
import { IndexPatternAttributes } from '../../../../../../../src/plugins/data/common';
import { DSL_BASE, DSL_CAT } from '../../../../../common/constants/shared';
import { getOSDHttp } from '../../../../../common/utils';
import { coreRefs } from '../../../../framework/core_refs';

interface State<T> {
  data?: T;
  loading: boolean;
  error?: Error;
}

type Action<T> =
  | { type: 'request' }
  | { type: 'success'; payload: State<T>['data'] }
  | { type: 'failure'; error: NonNullable<State<T>['error']> };

// TODO use instantiation expressions when typescript is upgraded to >= 4.7
type GenericReducer<T = any> = Reducer<State<T>, Action<T>>;
export const genericReducer: GenericReducer = (state, action) => {
  switch (action.type) {
    case 'request':
      return { data: state.data, loading: true };
    case 'success':
      return { loading: false, data: action.payload };
    case 'failure':
      return { loading: false, error: action.error };
    default:
      return state;
  }
};

export const useCatIndices = () => {
  const reducer: GenericReducer<EuiComboBoxOptionOption[]> = genericReducer;
  const [state, dispatch] = useReducer(reducer, { loading: false });
  const [refresh, setRefresh] = useState({});

  useEffect(() => {
    const abortController = new AbortController();
    dispatch({ type: 'request' });
    getOSDHttp()
      .get(`${DSL_BASE}${DSL_CAT}`, { query: { format: 'json' }, signal: abortController.signal })
      .then((payload: CatIndicesResponse) =>
        dispatch({
          type: 'success',
          payload: payload
            .filter((meta) => meta.index && !meta.index.startsWith('.'))
            .map((meta) => ({ label: meta.index! })),
        })
      )
      .catch((error) => dispatch({ type: 'failure', error }));

    return () => abortController.abort();
  }, [refresh]);

  return { ...state, refresh: () => setRefresh({}) };
};

export const useGetIndexPatterns = () => {
  const reducer: GenericReducer<EuiComboBoxOptionOption[]> = genericReducer;
  const [state, dispatch] = useReducer(reducer, { loading: false });
  const [refresh, setRefresh] = useState({});

  useEffect(() => {
    let abort = false;
    dispatch({ type: 'request' });

    coreRefs
      .savedObjectsClient!.find<IndexPatternAttributes>({ type: 'index-pattern', perPage: 10000 })
      .then((payload) => {
        if (!abort)
          dispatch({
            type: 'success',
            payload: payload.savedObjects.map((meta) => ({ label: meta.attributes.title })),
          });
      })
      .catch((error) => {
        if (!abort) dispatch({ type: 'failure', error });
      });

    return () => {
      abort = true;
    };
  }, [refresh]);

  return { ...state, refresh: () => setRefresh({}) };
};
